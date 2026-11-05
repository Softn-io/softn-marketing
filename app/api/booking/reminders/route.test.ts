import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { POST } from './route'

const jobMock = vi.hoisted(() => ({ runBookingReminders: vi.fn() }))

vi.mock('@/lib/booking/reminders', () => jobMock)

const SECRET = 'c'.repeat(48)

/** One call of the route, `POST` unless the test says otherwise. */
const request = (init: { readonly method?: string; readonly authorization?: string } = {}): Request =>
  new Request('https://softn.io/api/booking/reminders', {
    method: init.method ?? 'POST',
    ...(init.authorization === undefined ? {} : { headers: { authorization: init.authorization } }),
  })

let errorSpy: MockInstance

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubEnv('CRON_SECRET', SECRET)
  jobMock.runBookingReminders.mockReset()
  jobMock.runBookingReminders.mockResolvedValue({ ok: true, sent: 0, failed: 0, skipped: 0, details: [] })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('POST /api/booking/reminders authentication', () => {
  it('answers unavailable when the deployment holds no secret, without running the job', async () => {
    vi.stubEnv('CRON_SECRET', '')

    const response = await POST(request({ authorization: `Bearer ${SECRET}` }))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(jobMock.runBookingReminders).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith('[booking] reminders: unavailable: secret-unset')
  })

  it('refuses a request without a bearer token, and one with a wrong one', async () => {
    const missing = await POST(request())
    expect(missing.status).toBe(401)
    expect(await missing.json()).toEqual({ error: 'invalid' })

    const wrong = await POST(request({ authorization: `Bearer ${'w'.repeat(48)}` }))
    expect(wrong.status).toBe(401)
    expect(await wrong.json()).toEqual({ error: 'invalid' })

    // A value of another size is refused before any comparison of bytes.
    const short = await POST(request({ authorization: 'Bearer short' }))
    expect(short.status).toBe(401)

    // Another scheme is no token either.
    const basic = await POST(request({ authorization: `Basic ${SECRET}` }))
    expect(basic.status).toBe(401)

    expect(jobMock.runBookingReminders).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith('[booking] reminders: refused: unauthorized')
  })

  it('refuses a method other than POST', async () => {
    const response = await POST(request({ method: 'GET', authorization: `Bearer ${SECRET}` }))

    expect(response.status).toBe(405)
    expect(await response.json()).toEqual({ error: 'invalid' })
    expect(jobMock.runBookingReminders).not.toHaveBeenCalled()
  })
})

describe('POST /api/booking/reminders run', () => {
  it('runs the pass and answers the counts alone', async () => {
    jobMock.runBookingReminders.mockResolvedValue({
      ok: true,
      sent: 2,
      failed: 1,
      skipped: 3,
      details: ['reminder not sent: gmail timeout'],
    })

    const response = await POST(request({ authorization: `Bearer ${SECRET}` }))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ sent: 2, failed: 1, skipped: 3 })

    const [input] = jobMock.runBookingReminders.mock.calls[0] as [
      { now: Date; origin: string; subjectToken: string | undefined },
    ]
    expect(input.now).toBeInstanceOf(Date)
    expect(input.origin).toBe('https://softn.io')
    expect(input.subjectToken).toBeUndefined()

    // The pass' non-personal codes are logged, and they are the only thing logged.
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith('[booking] reminders: reminder not sent: gmail timeout')
  })

  it('pins the manage link origin to the canonical site in production, whatever the host', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')

    await POST(
      new Request('https://preview-abc.vercel.app/api/booking/reminders', {
        method: 'POST',
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    )

    const [input] = jobMock.runBookingReminders.mock.calls[0] as [{ origin: string }]
    expect(input.origin).toBe('https://softn.io')
  })

  it('keeps a personal value out of the response and the logs', async () => {
    jobMock.runBookingReminders.mockResolvedValue({
      ok: true,
      sent: 1,
      failed: 0,
      skipped: 0,
      details: ['reminder skipped: start-unreadable'],
    })

    const response = await POST(request({ authorization: `Bearer ${SECRET}` }))
    const body = JSON.stringify(await response.json())
    const logged = errorSpy.mock.calls.map((call) => String(call[0])).join('\n')

    for (const personal of ['camille@example.fr', 'Camille', 'softnabc', 'https://meet.google.com']) {
      expect(body).not.toContain(personal)
      expect(logged).not.toContain(personal)
    }
  })

  it('answers unavailable when the window itself could not be read, so a scheduled run fails', async () => {
    jobMock.runBookingReminders.mockResolvedValue({
      ok: false,
      detail: 'calendar unavailable: sts request-failed status=400',
    })

    const response = await POST(request({ authorization: `Bearer ${SECRET}` }))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(errorSpy).toHaveBeenCalledWith('[booking] reminders: calendar unavailable: sts request-failed status=400')
    // The counts never reach the caller: a run that never started is not a green zero.
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/booking/reminders deployment gate', () => {
  it('refuses a preview deployment before any authentication or calendar work', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')

    // No bearer token at all: the gate answers before the secret is even looked at.
    const response = await POST(request())

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(jobMock.runBookingReminders).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith('[booking] reminders: refused: preview deployment')
  })

  it('runs on a production deployment', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')

    const response = await POST(request({ authorization: `Bearer ${SECRET}` }))

    expect(response.status).toBe(200)
    expect(jobMock.runBookingReminders).toHaveBeenCalledTimes(1)
  })

  it('runs on a development deployment and on a local run, where no marker is set', async () => {
    vi.stubEnv('VERCEL_ENV', 'development')
    expect((await POST(request({ authorization: `Bearer ${SECRET}` }))).status).toBe(200)

    vi.stubEnv('VERCEL_ENV', '   ')
    expect((await POST(request({ authorization: `Bearer ${SECRET}` }))).status).toBe(200)

    expect(jobMock.runBookingReminders).toHaveBeenCalledTimes(2)
  })
})
