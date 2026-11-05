import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GOOGLE_BOOKING_SCOPES, readSubjectToken, VERCEL_OIDC_HEADER } from './auth'

const SUBJECT_TOKEN = 'subject-token-value'

const fetchMock = vi.fn<typeof fetch>()

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Answers the three steps of the keyless chain, in order. */
const answerChain = (): void => {
  const seen: string[] = []
  fetchMock.mockImplementation(async (input) => {
    const url = String(input)
    seen.push(url)
    if (url === 'https://sts.googleapis.com/v1/token') {
      return jsonResponse({ access_token: 'federated-token', expires_in: 3600 })
    }
    if (url.includes('iamcredentials.googleapis.com')) return jsonResponse({ signedJwt: 'signed-assertion' })
    return jsonResponse({ access_token: 'calendar-token', expires_in: 3600 })
  })
}

/** Calls made to one endpoint of the chain. */
const callsTo = (fragment: string): readonly { readonly url: string; readonly init: RequestInit | undefined }[] =>
  fetchMock.mock.calls
    .filter(([input]) => String(input).includes(fragment))
    .map(([input, init]) => ({ url: String(input), init }))

beforeEach(() => {
  vi.resetModules()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL', 'booking@softn-io.iam.gserviceaccount.com')
  vi.stubEnv('GOOGLE_CALENDAR_OWNER', 'melanie@softn.io')
  // A calendar of its own, never the impersonated address: the two are different values.
  vi.stubEnv('GOOGLE_CALENDAR_ID', 'abc123@group.calendar.google.com')
  vi.stubEnv('GCP_PROJECT_NUMBER', '123456789012')
  vi.stubEnv('GCP_WORKLOAD_IDENTITY_POOL_ID', 'vercel')
  vi.stubEnv('GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID', 'softn-site')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('readSubjectToken', () => {
  it('reads the request header Vercel sets, before anything else', () => {
    const request = new Request('https://softn.io/api/booking', {
      headers: { [VERCEL_OIDC_HEADER]: ` ${SUBJECT_TOKEN} ` },
    })

    expect(readSubjectToken(request)).toBe(SUBJECT_TOKEN)
  })

  it('falls back to the environment variable for local development', () => {
    vi.stubEnv('VERCEL_OIDC_TOKEN', SUBJECT_TOKEN)

    expect(readSubjectToken(null)).toBe(SUBJECT_TOKEN)
    expect(readSubjectToken(new Request('https://softn.io/api/booking'))).toBe(SUBJECT_TOKEN)
  })

  it('returns nothing when neither the header nor the environment provides a token', () => {
    expect(readSubjectToken(null)).toBeUndefined()
    expect(readSubjectToken(new Request('https://softn.io/api/booking'))).toBeUndefined()
    expect(
      readSubjectToken(new Request('https://softn.io/api/booking', { headers: { [VERCEL_OIDC_HEADER]: ' ' } })),
    ).toBeUndefined()
  })
})

describe('getAccessToken', () => {
  it('walks the keyless chain and returns the calendar access token', async () => {
    answerChain()
    const { getAccessToken } = await import('./auth')

    const result = await getAccessToken({ subjectToken: SUBJECT_TOKEN })

    expect(result).toEqual({ ok: true, data: 'calendar-token' })

    // 1. The subject token is exchanged for a federated token, with the documented audience.
    const [sts] = callsTo('sts.googleapis.com')
    expect(sts?.init?.method).toBe('POST')
    expect(JSON.parse(String(sts?.init?.body))).toEqual({
      grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
      audience:
        '//iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/vercel/providers/softn-site',
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      requestedTokenType: 'urn:ietf:params:oauth:token-type:access_token',
      subjectToken: SUBJECT_TOKEN,
      subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt',
    })

    // 2. The federated token signs a one-hour assertion for the calendar owner.
    const [signJwt] = callsTo('iamcredentials.googleapis.com')
    expect(signJwt?.url).toBe(
      'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/booking%40softn-io.iam.gserviceaccount.com:signJwt',
    )
    expect(signJwt?.init?.headers).toEqual({
      Authorization: 'Bearer federated-token',
      'Content-Type': 'application/json',
    })
    const assertion = JSON.parse(String(JSON.parse(String(signJwt?.init?.body))['payload'])) as Record<string, unknown>
    expect(assertion['iss']).toBe('booking@softn-io.iam.gserviceaccount.com')
    // The impersonated owner, not the booking calendar the events are written to.
    expect(assertion['sub']).toBe('melanie@softn.io')
    expect(assertion['scope']).toBe(GOOGLE_BOOKING_SCOPES.join(' '))
    expect(assertion['aud']).toBe('https://oauth2.googleapis.com/token')
    expect(Number(assertion['exp']) - Number(assertion['iat'])).toBe(3600)

    // 3. The assertion is traded at the OAuth 2.0 token endpoint, as a form body.
    const [token] = callsTo('oauth2.googleapis.com')
    expect(token?.init?.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' })
    expect(String(token?.init?.body)).toBe(
      'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=signed-assertion',
    )
  })

  it('reuses the calendar token it already holds, and never stores the subject token', async () => {
    answerChain()
    const { getAccessToken } = await import('./auth')

    await getAccessToken({ subjectToken: SUBJECT_TOKEN })
    const afterFirst = fetchMock.mock.calls.length
    await getAccessToken({ subjectToken: 'another-subject-token' })

    expect(fetchMock.mock.calls).toHaveLength(afterFirst)
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('another-subject-token')
  })

  it('keeps the Gmail scope out of the calendar token, and asks it alone for the mail call', async () => {
    answerChain()
    const { getAccessToken, GOOGLE_BOOKING_SCOPES, GOOGLE_GMAIL_SEND_SCOPES } = await import('./auth')

    // The calendar default is unchanged, and its assertion never carries the mail scope.
    await getAccessToken({ subjectToken: SUBJECT_TOKEN })
    const [calendarSigning] = callsTo('iamcredentials.googleapis.com')
    const calendarAssertion = JSON.parse(String(JSON.parse(String(calendarSigning?.init?.body))['payload'])) as Record<
      string,
      unknown
    >
    expect(calendarAssertion['scope']).toBe(GOOGLE_BOOKING_SCOPES.join(' '))
    expect(String(calendarAssertion['scope'])).not.toContain('gmail.send')

    // The mail call asks for its own scope, and its own token is minted: the cache is keyed on it.
    const callsBefore = fetchMock.mock.calls.length
    await getAccessToken({ subjectToken: SUBJECT_TOKEN, scopes: GOOGLE_GMAIL_SEND_SCOPES })
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore)

    const signings = callsTo('iamcredentials.googleapis.com')
    const mailAssertion = JSON.parse(String(JSON.parse(String(signings[1]?.init?.body))['payload'])) as Record<
      string,
      unknown
    >
    expect(mailAssertion['scope']).toBe('https://www.googleapis.com/auth/gmail.send')

    // A second mail call reuses that token instead of walking the chain again.
    const afterMail = fetchMock.mock.calls.length
    await getAccessToken({ subjectToken: SUBJECT_TOKEN, scopes: GOOGLE_GMAIL_SEND_SCOPES })
    expect(fetchMock.mock.calls).toHaveLength(afterMail)
  })

  it('fails closed without a subject token and without configuration, with no network call', async () => {
    const { getAccessToken } = await import('./auth')

    expect(await getAccessToken({ subjectToken: undefined })).toEqual({ ok: false, error: 'not-configured' })
    expect(await getAccessToken({ subjectToken: '' })).toEqual({ ok: false, error: 'not-configured' })

    vi.stubEnv('GCP_PROJECT_NUMBER', '')
    vi.resetModules()
    const withoutProject = await import('./auth')
    expect(await withoutProject.getAccessToken({ subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'not-configured',
    })

    vi.stubEnv('GCP_PROJECT_NUMBER', 'not-a-number')
    vi.resetModules()
    await expect(import('./auth')).rejects.toThrow('GCP_PROJECT_NUMBER')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed when the owner is missing, and never impersonates the booking calendar', async () => {
    vi.stubEnv('GOOGLE_CALENDAR_OWNER', '')
    const { getAccessToken } = await import('./auth')

    // The calendar id is set: it is still not an identity, so the chain does not start.
    expect(await getAccessToken({ subjectToken: SUBJECT_TOKEN })).toEqual({ ok: false, error: 'not-configured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keys the token cache on the impersonated owner, not on the booking calendar', async () => {
    answerChain()
    const { getAccessToken } = await import('./auth')

    await getAccessToken({ subjectToken: SUBJECT_TOKEN })
    const afterFirst = fetchMock.mock.calls.length

    // Another calendar the same owner can write to needs no new token: the identity is unchanged.
    vi.stubEnv('GOOGLE_CALENDAR_ID', 'def456@group.calendar.google.com')
    await getAccessToken({ subjectToken: SUBJECT_TOKEN })
    expect(fetchMock.mock.calls).toHaveLength(afterFirst)

    // Another owner is another identity: the whole chain runs again.
    vi.stubEnv('GOOGLE_CALENDAR_OWNER', 'marie@softn.io')
    await getAccessToken({ subjectToken: SUBJECT_TOKEN })
    expect(fetchMock.mock.calls.length).toBeGreaterThan(afterFirst)
  })

  it('maps a refused exchange to unauthorized', async () => {
    fetchMock.mockResolvedValue(new Response('not json at all', { status: 403 }))
    const { getAccessToken } = await import('./auth')

    expect(await getAccessToken({ subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'unauthorized',
      status: 403,
      step: 'sts',
    })
    expect(callsTo('iamcredentials.googleapis.com')).toEqual([])
  })

  it('keeps the reason of a refused exchange, so a live 400 is diagnosable', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { errors: [{ reason: 'invalidSubjectToken', message: 'Invalid subject token.' }], code: 400 } },
        400,
      ),
    )
    const { getAccessToken } = await import('./auth')

    expect(await getAccessToken({ subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'request-failed',
      status: 400,
      step: 'sts',
      reason: 'invalidSubjectToken',
    })
  })

  it('maps a refused signing call to unauthorized and stops there', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url === 'https://sts.googleapis.com/v1/token') {
        return jsonResponse({ access_token: 'federated-token', expires_in: 3600 })
      }
      return new Response('not json at all', { status: 403 })
    })
    const { getAccessToken } = await import('./auth')

    expect(await getAccessToken({ subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'unauthorized',
      status: 403,
      step: 'signJwt',
    })
    expect(callsTo('oauth2.googleapis.com')).toEqual([])
  })

  it('maps a timeout and an unexpected answer to their own codes', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'))
    const timedOut = await import('./auth')
    expect(await timedOut.getAccessToken({ subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'timeout',
      step: 'sts',
    })

    vi.resetModules()
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(jsonResponse({ scope: 'x' }))
    const invalid = await import('./auth')
    expect(await invalid.getAccessToken({ subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'invalid-response',
      step: 'sts',
    })
  })

  it('never logs the subject token or an upstream body', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    fetchMock.mockResolvedValue(new Response(`leaked ${SUBJECT_TOKEN}`, { status: 500 }))
    const { getAccessToken } = await import('./auth')

    await getAccessToken({ subjectToken: SUBJECT_TOKEN })

    expect(errorSpy).not.toHaveBeenCalled()
    expect(logSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
    logSpy.mockRestore()
  })
})
