import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SUBJECT_TOKEN = 'subject-token-value'

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const fetchMock = vi.fn<typeof fetch>()

/** Endpoints of the keyless credential chain, which is always answered the same way here. */
const CHAIN_ENDPOINTS = ['https://sts.googleapis.com/v1/token', 'https://oauth2.googleapis.com/token']

/**
 * Answers the keyless credential chain, then hands the Gmail call to the given responder.
 *
 * The credential chain has its own tests; answering it here keeps every test focused on the send.
 */
const withToken = (responder: (url: string, init: RequestInit | undefined) => Response | Promise<Response>): void => {
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input)
    if (url === CHAIN_ENDPOINTS[0]) return jsonResponse({ access_token: 'federated-token', expires_in: 3600 })
    if (url.includes('iamcredentials.googleapis.com')) return jsonResponse({ signedJwt: 'signed-assertion' })
    if (url === CHAIN_ENDPOINTS[1]) return jsonResponse({ access_token: 'mail-token', expires_in: 3600 })
    return responder(url, init)
  })
}

/** Every call that is not part of the credential chain. */
const gmailCalls = (): readonly { readonly url: string; readonly init: RequestInit | undefined }[] =>
  fetchMock.mock.calls
    .filter(([input]) => {
      const url = String(input)
      return !CHAIN_ENDPOINTS.includes(url) && !url.includes('iamcredentials.googleapis.com')
    })
    .map(([input, init]) => ({ url: String(input), init }))

/** Scope of the assertion the service account signed, as the chain recorded it. */
const signedScope = (): string => {
  const call = fetchMock.mock.calls.find(([input]) => String(input).includes('iamcredentials.googleapis.com'))
  const body = JSON.parse(String(call?.[1]?.body)) as { payload: string }
  return String((JSON.parse(body.payload) as Record<string, unknown>)['scope'])
}

/** The `raw` field of one send call, decoded back to its MIME text. */
const sentMessage = (call: { readonly init: RequestInit | undefined }): string => {
  const body = JSON.parse(String(call.init?.body)) as { raw: string }
  return Buffer.from(body.raw, 'base64url').toString('utf8')
}

beforeEach(() => {
  vi.resetModules()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL', 'booking@softn-io.iam.gserviceaccount.com')
  vi.stubEnv('GOOGLE_CALENDAR_OWNER', 'melanie@softn.io')
  vi.stubEnv('GOOGLE_CALENDAR_ID', 'melanie@softn.io')
  vi.stubEnv('GCP_PROJECT_NUMBER', '123456789012')
  vi.stubEnv('GCP_WORKLOAD_IDENTITY_POOL_ID', 'vercel')
  vi.stubEnv('GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID', 'softn-site')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('sendGmailMessage', () => {
  it('sends the base64url message as the impersonated owner, under the gmail.send scope alone', async () => {
    withToken(() => jsonResponse({ id: 'message-id' }))
    const { sendGmailMessage } = await import('./gmail')

    const result = await sendGmailMessage({
      message: 'From: "Softn.io" <meet@softn.io>\r\nTo: <marie@example.fr>\r\n\r\nBonjour\r\n',
      subjectToken: SUBJECT_TOKEN,
    })

    expect(result).toEqual({ ok: true, data: { messageId: 'message-id' } })

    const [call] = gmailCalls()
    if (call === undefined) throw new Error('the send call must have been made')
    expect(call.url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send')
    expect(call.init?.method).toBe('POST')
    expect(call.init?.headers).toEqual({ Authorization: 'Bearer mail-token', 'Content-Type': 'application/json' })
    // The RFC 5322 message travels base64url-encoded under `raw`, as the send guide documents.
    expect(sentMessage(call)).toBe('From: "Softn.io" <meet@softn.io>\r\nTo: <marie@example.fr>\r\n\r\nBonjour\r\n')

    // The Gmail call is the only one that asks for the mail scope: the calendar keeps its own.
    expect(signedScope()).toBe('https://www.googleapis.com/auth/gmail.send')
  })

  it('maps a refusal to unauthorized and a broken call to its code', async () => {
    withToken(() => new Response('not json at all', { status: 403 }))
    const refused = await import('./gmail')
    expect(await refused.sendGmailMessage({ message: 'm', subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'unauthorized',
      status: 403,
    })

    vi.resetModules()
    fetchMock.mockReset()
    withToken(() => new Response('not json at all', { status: 502 }))
    const broken = await import('./gmail')
    expect(await broken.sendGmailMessage({ message: 'm', subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'request-failed',
      status: 502,
    })
  })

  it('keeps the machine-readable reason of a refusal', async () => {
    withToken(() =>
      jsonResponse(
        {
          error: {
            errors: [{ domain: 'usageLimits', reason: 'userRateLimitExceeded', message: 'User Rate Limit Exceeded' }],
            code: 403,
          },
        },
        403,
      ),
    )
    const { sendGmailMessage } = await import('./gmail')

    expect(await sendGmailMessage({ message: 'm', subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'unauthorized',
      status: 403,
      reason: 'userRateLimitExceeded',
    })
  })

  it('never retries a rate-limited send: a second message is not the answer to a lost one', async () => {
    withToken(() => jsonResponse({ error: { errors: [{ reason: 'rateLimitExceeded' }], code: 429 } }, 429))
    const { sendGmailMessage } = await import('./gmail')

    expect(await sendGmailMessage({ message: 'm', subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'request-failed',
      status: 429,
      reason: 'rateLimitExceeded',
    })
    expect(gmailCalls()).toHaveLength(1)
  })

  it('refuses an answer that carries no message id', async () => {
    withToken(() => jsonResponse({ threadId: 'thread-id' }))
    const { sendGmailMessage } = await import('./gmail')

    expect(await sendGmailMessage({ message: 'm', subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'invalid-response',
    })
  })

  it('reports a timeout as its own code', async () => {
    withToken(() => {
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    })
    const { sendGmailMessage } = await import('./gmail')

    expect(await sendGmailMessage({ message: 'm', subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'timeout',
    })
  })

  it('fails closed without configuration, without any network call', async () => {
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL', '')
    vi.stubEnv('GCP_PROJECT_NUMBER', '')
    const { sendGmailMessage } = await import('./gmail')

    expect(await sendGmailMessage({ message: 'm', subjectToken: SUBJECT_TOKEN })).toEqual({
      ok: false,
      error: 'not-configured',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
