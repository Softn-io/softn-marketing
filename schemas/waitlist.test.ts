import { describe, expect, it } from 'vitest'
import { WAITLIST_EMAIL_MAX_LENGTH } from './waitlistLimits'
import { WaitlistSubmissionSchema } from './waitlist'

describe('WaitlistSubmissionSchema', () => {
  it('trims and lowercases a valid e-mail', () => {
    const result = WaitlistSubmissionSchema.safeParse({ email: '  Mel@Example.FR ' })
    if (!result.success) throw new Error('expected a valid submission')

    expect(result.data.email).toBe('mel@example.fr')
  })

  it('accepts a submission without honeypot or render timestamp', () => {
    const result = WaitlistSubmissionSchema.safeParse({ email: 'mel@example.fr' })
    if (!result.success) throw new Error('expected a valid submission')

    expect(result.data.honeypot).toBe('')
    expect(result.data.renderedAt).toBe('')
  })

  it('rejects an empty e-mail', () => {
    expect(WaitlistSubmissionSchema.safeParse({ email: '   ' }).success).toBe(false)
  })

  it.each(['mel', 'mel@', '@example.fr', 'mel@example', 'mel @example.fr'])(
    'rejects the malformed address %s',
    (email) => {
      expect(WaitlistSubmissionSchema.safeParse({ email }).success).toBe(false)
    },
  )

  it('rejects an address longer than the RFC limit', () => {
    const email = `${'a'.repeat(WAITLIST_EMAIL_MAX_LENGTH)}@example.fr`

    expect(WaitlistSubmissionSchema.safeParse({ email }).success).toBe(false)
  })

  it('accepts an address of exactly the RFC maximum length after trimming', () => {
    // A 243-character local part, an '@' and a 10-character domain add up to exactly
    // `WAITLIST_EMAIL_MAX_LENGTH` (254) characters, the boundary the schema must accept. The mixed
    // case exercises the stored value: the schema lowercases the address. Surrounding spaces
    // exercise the trimming: the schema must strip them before counting the length.
    const domain = 'Example.FR'
    const address = `Mel.${'a'.repeat(WAITLIST_EMAIL_MAX_LENGTH - domain.length - 1 - 4)}@${domain}`
    expect(address.length).toBe(WAITLIST_EMAIL_MAX_LENGTH)

    const result = WaitlistSubmissionSchema.safeParse({ email: `  ${address} ` })
    if (!result.success) throw new Error('expected a valid submission')

    const trimmed = address.toLowerCase()
    expect(result.data.email).toBe(trimmed)
    expect(trimmed.length).toBe(WAITLIST_EMAIL_MAX_LENGTH)
  })

  it('accepts a timestamp-shaped string and a filled honeypot for the action to inspect', () => {
    const result = WaitlistSubmissionSchema.safeParse({
      email: 'mel@example.fr',
      honeypot: 'https://spam.example',
      renderedAt: '1720000000000',
    })
    if (!result.success) throw new Error('expected a valid submission')

    expect(result.data.honeypot).toBe('https://spam.example')
    expect(result.data.renderedAt).toBe('1720000000000')
  })
})
