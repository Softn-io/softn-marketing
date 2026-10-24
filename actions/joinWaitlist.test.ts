import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAirtableRecord } from '@/lib/airtable'
import { WAITLIST_FIELDS, WAITLIST_MIN_DELAY_MS, WAITLIST_SOURCE } from '@/schemas/waitlist'
import { joinWaitlist } from './joinWaitlist'

vi.mock('@/lib/airtable', () => ({
  createAirtableRecord: vi.fn(),
}))

const airtableMock = vi.mocked(createAirtableRecord)

const submission = (fields: Readonly<Record<string, string>>): FormData => {
  const formData = new FormData()
  for (const [name, value] of Object.entries(fields)) formData.set(name, value)
  return formData
}

beforeEach(() => {
  vi.stubEnv('AIRTABLE_WAITLIST_TABLE_ID', 'tblWaitlist')
  airtableMock.mockReset()
  airtableMock.mockResolvedValue({ ok: true, data: { id: 'rec123' } })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('joinWaitlist', () => {
  it('normalises the e-mail and stores the source in Airtable', async () => {
    const result = await joinWaitlist(
      null,
      submission({ [WAITLIST_FIELDS.email]: '  Mel@Example.FR ', [WAITLIST_FIELDS.renderedAt]: '1' }),
    )

    expect(result).toEqual({ ok: true })
    expect(airtableMock).toHaveBeenCalledTimes(1)
    expect(airtableMock).toHaveBeenCalledWith({
      tableId: 'tblWaitlist',
      fields: { Email: 'mel@example.fr', Source: WAITLIST_SOURCE },
    })
  })

  it('rejects an invalid e-mail without calling Airtable', async () => {
    const result = await joinWaitlist(null, submission({ [WAITLIST_FIELDS.email]: 'not-an-email' }))

    expect(result).toEqual({ ok: false, error: 'invalid' })
    expect(airtableMock).not.toHaveBeenCalled()
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
    expect(airtableMock).not.toHaveBeenCalled()
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
    expect(airtableMock).not.toHaveBeenCalled()
  })

  it('accepts a submission made after the anti-spam delay', async () => {
    const renderedAt = String(Date.now() - WAITLIST_MIN_DELAY_MS - 1000)

    const result = await joinWaitlist(
      null,
      submission({ [WAITLIST_FIELDS.email]: 'mel@example.fr', [WAITLIST_FIELDS.renderedAt]: renderedAt }),
    )

    expect(result).toEqual({ ok: true })
    expect(airtableMock).toHaveBeenCalledTimes(1)
  })

  it('maps an Airtable failure to a server error', async () => {
    airtableMock.mockResolvedValueOnce({ ok: false, error: 'request-failed' })

    const result = await joinWaitlist(null, submission({ [WAITLIST_FIELDS.email]: 'mel@example.fr' }))

    expect(result).toEqual({ ok: false, error: 'server' })
  })

  it('returns a server error when the waitlist table is not configured', async () => {
    vi.stubEnv('AIRTABLE_WAITLIST_TABLE_ID', '')

    const result = await joinWaitlist(null, submission({ [WAITLIST_FIELDS.email]: 'mel@example.fr' }))

    expect(result).toEqual({ ok: false, error: 'server' })
    expect(airtableMock).not.toHaveBeenCalled()
  })

  it('never returns the submitted e-mail', async () => {
    airtableMock.mockResolvedValueOnce({ ok: false, error: 'request-failed' })

    const result = await joinWaitlist(null, submission({ [WAITLIST_FIELDS.email]: 'mel@example.fr' }))

    expect(JSON.stringify(result)).not.toContain('mel@example.fr')
  })
})
