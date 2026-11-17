import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { CONTACT_LEAD_FIELDS, CONTACT_LEAD_SOURCE, CONTACT_LEAD_STATUS } from '@/lib/contact/lead'
import { CONTACT_REPLAY_STORE_UNAVAILABLE } from '@/lib/contact/replayStore'
import { CONTACT_FIELDS, CONTACT_MIN_FILL_MS } from '@/schemas/contactLimits'
import { POST } from './route'

const altchaMock = vi.hoisted(() => ({
  readContactAltcha: vi.fn(),
  verifyContactAltchaPayload: vi.fn(),
}))

const baserowMock = vi.hoisted(() => ({ createBaserowRow: vi.fn() }))

const rateLimitMock = vi.hoisted(() => ({ checkRateLimit: vi.fn(), trustedClientIp: vi.fn() }))

const emailMock = vi.hoisted(() => ({
  sendContactNotificationEmail: vi.fn(),
  sendContactAutoReplyEmail: vi.fn(),
}))

vi.mock('@/lib/contact/altcha', () => altchaMock)
vi.mock('@/lib/baserow', () => baserowMock)
vi.mock('@/lib/rateLimit', () => rateLimitMock)
vi.mock('@/lib/contact/emails', () => emailMock)

let errorSpy: MockInstance

/** Verified Altcha payload: the plugin reports no error, and the challenge was claimed once. */
const verifiedAltcha = { error: null }

/** Body of a valid contact message. */
const contactBody = (overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> => ({
  firstName: 'Camille',
  lastName: 'Durand',
  email: 'camille@example.fr',
  subject: 'quote',
  message: 'Bonjour, je souhaite un devis pour un site.',
  consent: true,
  [CONTACT_FIELDS.honeypot]: '',
  [CONTACT_FIELDS.renderedAt]: String(Date.now() - CONTACT_MIN_FILL_MS - 1000),
  [CONTACT_FIELDS.altcha]: 'payload',
  ...overrides,
})

const request = (
  body: unknown,
  headers: Readonly<Record<string, string>> = {
    origin: 'http://localhost',
    'content-type': 'application/json',
  },
): Request =>
  new Request('http://localhost/api/contact', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubEnv('BASEROW_LEADS_TABLE_ID', '42')
  vi.stubEnv('BASEROW_TOKEN', 'test-token')
  altchaMock.readContactAltcha.mockReset()
  altchaMock.verifyContactAltchaPayload.mockReset()
  baserowMock.createBaserowRow.mockReset()
  rateLimitMock.checkRateLimit.mockReset()
  rateLimitMock.trustedClientIp.mockReset()
  emailMock.sendContactNotificationEmail.mockReset()
  emailMock.sendContactAutoReplyEmail.mockReset()

  altchaMock.readContactAltcha.mockResolvedValue({ plugin: {} })
  altchaMock.verifyContactAltchaPayload.mockResolvedValue(verifiedAltcha)
  baserowMock.createBaserowRow.mockResolvedValue({ ok: true, data: { id: 7 } })
  rateLimitMock.checkRateLimit.mockResolvedValue({ ok: true, data: 'allowed' })
  rateLimitMock.trustedClientIp.mockReturnValue('test-client')
  emailMock.sendContactNotificationEmail.mockResolvedValue({ ok: true })
  emailMock.sendContactAutoReplyEmail.mockResolvedValue({ ok: true })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('POST /api/contact guards', () => {
  it('refuses a request without a browser origin', async () => {
    const response = await POST(request(contactBody(), { 'content-type': 'application/json' }))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'invalid' })
    expect(baserowMock.createBaserowRow).not.toHaveBeenCalled()
  })

  it('refuses a cross-origin request', async () => {
    const response = await POST(
      request(contactBody(), { origin: 'https://spam.example', 'content-type': 'application/json' }),
    )

    expect(response.status).toBe(403)
    expect(baserowMock.createBaserowRow).not.toHaveBeenCalled()
  })

  it('refuses a body that does not declare JSON', async () => {
    const response = await POST(
      new Request('http://localhost/api/contact', {
        method: 'POST',
        headers: { origin: 'http://localhost', 'content-type': 'text/plain' },
        body: 'hello',
      }),
    )

    expect(response.status).toBe(415)
    expect(baserowMock.createBaserowRow).not.toHaveBeenCalled()
  })

  it('refuses a body larger than the bound before parsing it', async () => {
    const response = await POST(
      request(contactBody({ message: 'a'.repeat(20_000) }), {
        origin: 'http://localhost',
        'content-type': 'application/json',
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid' })
  })

  it('bounds a chunked body with no declared length on the bytes it actually receives', async () => {
    const oversized = JSON.stringify(contactBody({ message: 'a'.repeat(20_000) }))
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(oversized))
        controller.close()
      },
    })
    // The runtime requires `duplex` for a streamed body; the DOM type does not carry it yet.
    const init: RequestInit & { duplex?: 'half' } = {
      method: 'POST',
      headers: { origin: 'http://localhost', 'content-type': 'application/json' },
      body: stream,
      duplex: 'half',
    }
    const chunked = new Request('http://localhost/api/contact', init)

    const response = await POST(chunked)

    expect(chunked.headers.get('content-length')).toBeNull()
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid' })
    expect(baserowMock.createBaserowRow).not.toHaveBeenCalled()
  })

  it('counts the request before it reads the body', async () => {
    rateLimitMock.checkRateLimit.mockResolvedValue({ ok: true, data: 'limited' })

    const response = await POST(request(contactBody()))

    expect(response.status).toBe(429)
    expect(altchaMock.readContactAltcha).not.toHaveBeenCalled()
  })

  it('fails closed when the deployment has no signing secret', async () => {
    altchaMock.readContactAltcha.mockResolvedValue(null)

    const response = await POST(request(contactBody()))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(baserowMock.createBaserowRow).not.toHaveBeenCalled()
  })
})

describe('POST /api/contact rate limit with the real limiter', () => {
  /** Commands the limiter sent to the store, in order. */
  const pipelineCalls: string[][] = []

  /** Answers the store's pipeline with an incrementing counter, like Upstash does. */
  const storeFetch = vi.fn<typeof fetch>(async (_input, init) => {
    const commands = JSON.parse(String(init?.body)) as string[][]
    pipelineCalls.push(...commands)
    const increment = pipelineCalls.filter(([command]) => command === 'INCR').length

    return new Response(JSON.stringify([{ result: increment }, { result: 1 }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  beforeEach(() => {
    pipelineCalls.length = 0
    storeFetch.mockClear()
    vi.stubGlobal('fetch', storeFetch)
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://eu1-example.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-store-token')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('counts one store increment per submission, and refuses the sixth', async () => {
    // The route is loaded again with the real limiter, so the store calls are its own.
    vi.doUnmock('@/lib/rateLimit')
    vi.resetModules()
    const { POST: postWithRealLimiter } = await import('./route')

    const answers: number[] = []
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await postWithRealLimiter(request(contactBody()))
      answers.push(response.status)
    }

    // Five submissions pass, the sixth meets the window of five.
    expect(answers).toEqual([200, 200, 200, 200, 200, 429])
    // One increment per submission, never two: the counter the store saw is the number of requests.
    expect(pipelineCalls.filter(([command]) => command === 'INCR')).toHaveLength(6)
    expect(storeFetch).toHaveBeenCalledTimes(6)
  })
})

describe('POST /api/contact rate limit', () => {
  it('answers the rate-limit code once the window is full', async () => {
    rateLimitMock.checkRateLimit.mockResolvedValue({ ok: true, data: 'limited' })

    const response = await POST(request(contactBody()))

    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: 'rate-limited' })
    expect(baserowMock.createBaserowRow).not.toHaveBeenCalled()
  })

  it('fails closed when the store cannot answer', async () => {
    rateLimitMock.checkRateLimit.mockResolvedValue({ ok: false, error: 'store-timeout' })

    const response = await POST(request(contactBody()))

    expect(response.status).toBe(503)
    expect(baserowMock.createBaserowRow).not.toHaveBeenCalled()
  })
})

describe('POST /api/contact anti-bot signals', () => {
  it('answers a filled honeypot with the success state, without storing or sending anything', async () => {
    const response = await POST(request(contactBody({ [CONTACT_FIELDS.honeypot]: 'https://spam.example' })))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ sent: true })
    expect(baserowMock.createBaserowRow).not.toHaveBeenCalled()
    expect(emailMock.sendContactNotificationEmail).not.toHaveBeenCalled()
  })

  it('answers a submission under the minimum fill time with the success state', async () => {
    const response = await POST(request(contactBody({ [CONTACT_FIELDS.renderedAt]: String(Date.now()) })))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ sent: true })
    expect(baserowMock.createBaserowRow).not.toHaveBeenCalled()
  })

  it('refuses a payload the plugin did not verify, without storing anything', async () => {
    altchaMock.verifyContactAltchaPayload.mockResolvedValue({ error: 'ALTCHA payload has been already used.' })

    const response = await POST(request(contactBody()))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid' })
    expect(baserowMock.createBaserowRow).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('altcha'))
  })

  it('fails closed when the replay store could not answer', async () => {
    altchaMock.verifyContactAltchaPayload.mockResolvedValue({ error: CONTACT_REPLAY_STORE_UNAVAILABLE })

    const response = await POST(request(contactBody()))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(baserowMock.createBaserowRow).not.toHaveBeenCalled()
  })
})

describe('POST /api/contact validation', () => {
  it('refuses an invalid body without storing anything', async () => {
    const response = await POST(request(contactBody({ email: 'not-an-email' })))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid' })
    expect(baserowMock.createBaserowRow).not.toHaveBeenCalled()
  })

  it('refuses a message under the minimum length and a missing consent', async () => {
    expect((await POST(request(contactBody({ message: 'court' })))).status).toBe(400)
    expect((await POST(request(contactBody({ consent: false })))).status).toBe(400)
    expect(baserowMock.createBaserowRow).not.toHaveBeenCalled()
  })
})

describe('POST /api/contact storage and emails', () => {
  it('stores the lead before sending anything, and answers the success state', async () => {
    const response = await POST(request(contactBody()))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ sent: true })
    expect(baserowMock.createBaserowRow).toHaveBeenCalledTimes(1)

    const [input] = baserowMock.createBaserowRow.mock.calls[0] ?? []
    expect(input?.tableId).toBe('42')
    expect(input?.fields[CONTACT_LEAD_FIELDS.subject]).toBe('Demande de devis')
    expect(input?.fields[CONTACT_LEAD_FIELDS.need]).toBe('Bonjour, je souhaite un devis pour un site.')
    expect(input?.fields[CONTACT_LEAD_FIELDS.consent]).toBe(true)
    expect(input?.fields[CONTACT_LEAD_FIELDS.source]).toBe(CONTACT_LEAD_SOURCE)
    expect(input?.fields[CONTACT_LEAD_FIELDS.status]).toBe(CONTACT_LEAD_STATUS)
    expect(input?.fields[CONTACT_LEAD_FIELDS.consentOn]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(input?.verifyFields).toBeDefined()

    expect(emailMock.sendContactNotificationEmail).toHaveBeenCalledTimes(1)
    expect(emailMock.sendContactAutoReplyEmail).toHaveBeenCalledTimes(1)
    const [notification] = emailMock.sendContactNotificationEmail.mock.calls[0] ?? []
    expect(notification?.lead.email).toBe('camille@example.fr')
  })

  it('answers the unavailable code and sends nothing when the lead could not be stored', async () => {
    baserowMock.createBaserowRow.mockResolvedValue({ ok: false, error: 'request-failed', status: 500 })

    const response = await POST(request(contactBody()))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(emailMock.sendContactNotificationEmail).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('baserow'))
  })

  it('keeps the message and sends the emails when Baserow stored the row without a verified column', async () => {
    baserowMock.createBaserowRow.mockResolvedValue({ ok: false, error: 'schema-mismatch', rowId: 7 })

    const response = await POST(request(contactBody()))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ sent: true })
    expect(emailMock.sendContactNotificationEmail).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('schema-mismatch'))
  })

  it('answers the success state when an email fails, and logs it without personal data', async () => {
    emailMock.sendContactNotificationEmail.mockResolvedValue({ ok: false, detail: 'gmail request-failed status=500' })
    emailMock.sendContactAutoReplyEmail.mockRejectedValue(new Error('compose exploded'))

    const response = await POST(request(contactBody()))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ sent: true })

    const logged = errorSpy.mock.calls.flat().join(' ')
    expect(logged).toContain('notification')
    expect(logged).toContain('auto-reply')
    expect(logged).not.toContain('camille@example.fr')
    expect(logged).not.toContain('Bonjour, je souhaite un devis')
  })

  it('never echoes a submitted value in its answers', async () => {
    baserowMock.createBaserowRow.mockResolvedValue({ ok: false, error: 'request-failed' })

    const response = await POST(request(contactBody()))
    const body = JSON.stringify(await response.json())

    expect(body).not.toContain('camille@example.fr')
    expect(body).not.toContain('Camille')
    expect(body).not.toContain('devis')
  })
})
