import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBaserowRow } from '@/lib/baserow'
import { WAITLIST_FIELDS, WAITLIST_MIN_DELAY_MS, WAITLIST_SOURCE } from '@/schemas/waitlistLimits'
import { joinWaitlist } from './joinWaitlist'

vi.mock('@/lib/baserow', () => ({
  createBaserowRow: vi.fn(),
}))

const baserowMock = vi.mocked(createBaserowRow)

const submission = (fields: Readonly<Record<string, string>>): FormData => {
  const formData = new FormData()
  for (const [name, value] of Object.entries(fields)) formData.set(name, value)
  return formData
}

beforeEach(() => {
  vi.stubEnv('BASEROW_WAITLIST_TABLE_ID', '123456')
  baserowMock.mockReset()
  baserowMock.mockResolvedValue({ ok: true, data: { id: 1 } })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('joinWaitlist', () => {
  it('normalises the e-mail and stores the source in Baserow', async () => {
    const result = await joinWaitlist(
      null,
      submission({ [WAITLIST_FIELDS.email]: '  Mel@Example.FR ', [WAITLIST_FIELDS.renderedAt]: '1' }),
    )

    expect(result).toEqual({ ok: true })
    expect(baserowMock).toHaveBeenCalledTimes(1)
    expect(baserowMock).toHaveBeenCalledWith({
      tableId: '123456',
      fields: { Email: 'mel@example.fr', Source: WAITLIST_SOURCE },
    })
  })

  it('rejects an invalid e-mail without calling Baserow', async () => {
    const result = await joinWaitlist(null, submission({ [WAITLIST_FIELDS.email]: 'not-an-email' }))

    expect(result).toEqual({ ok: false, error: 'invalid' })
    expect(baserowMock).not.toHaveBeenCalled()
  })

  it('answers with the success state when the honeypot is filled, without a network call', async () => {
    const result = await joinWaitlist(
      null,
      submission({
        [WAITLIST_FIELDS.email]: 'mel@example.fr',
        [WAITLIST_FIELDS.honeypot]: 'https://spam.example',
      }),
    )

    expect(result).toEqual({ ok: true })
    expect(baserowMock).not.toHaveBeenCalled()
  })

  it('answers with the success state when the form is submitted too fast, without a network call', async () => {
    const result = await joinWaitlist(
      null,
      submission({
        [WAITLIST_FIELDS.email]: 'mel@example.fr',
        [WAITLIST_FIELDS.renderedAt]: String(Date.now()),
      }),
    )

    expect(result).toEqual({ ok: true })
    expect(baserowMock).not.toHaveBeenCalled()
  })

  it('accepts a submission made after the anti-spam delay', async () => {
    const renderedAt = String(Date.now() - WAITLIST_MIN_DELAY_MS - 1000)

    const result = await joinWaitlist(
      null,
      submission({ [WAITLIST_FIELDS.email]: 'mel@example.fr', [WAITLIST_FIELDS.renderedAt]: renderedAt }),
    )

    expect(result).toEqual({ ok: true })
    expect(baserowMock).toHaveBeenCalledTimes(1)
  })

  it('maps a Baserow failure to a server error', async () => {
    baserowMock.mockResolvedValueOnce({ ok: false, error: 'request-failed' })

    const result = await joinWaitlist(null, submission({ [WAITLIST_FIELDS.email]: 'mel@example.fr' }))

    expect(result).toEqual({ ok: false, error: 'server' })
  })

  it('returns a server error when the waitlist table is not configured', async () => {
    vi.stubEnv('BASEROW_WAITLIST_TABLE_ID', '')

    const result = await joinWaitlist(null, submission({ [WAITLIST_FIELDS.email]: 'mel@example.fr' }))

    expect(result).toEqual({ ok: false, error: 'server' })
    expect(baserowMock).not.toHaveBeenCalled()
  })

  it('never returns the submitted e-mail', async () => {
    baserowMock.mockResolvedValueOnce({ ok: false, error: 'request-failed' })

    const result = await joinWaitlist(null, submission({ [WAITLIST_FIELDS.email]: 'mel@example.fr' }))

    expect(JSON.stringify(result)).not.toContain('mel@example.fr')
  })
})
