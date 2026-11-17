import { describe, expect, it } from 'vitest'
import { ContactRequestSchema } from './contact'

const validRequest = {
  firstName: 'Camille',
  lastName: 'Durand',
  email: '  Camille@Example.FR ',
  subject: 'quote',
  message: '  Bonjour,\n\nje souhaite un devis.  ',
  consent: true,
  reference: '',
  renderedAt: '1',
  altcha: 'payload',
}

describe('ContactRequestSchema', () => {
  it('accepts a valid message and normalises the e-mail', () => {
    const parsed = ContactRequestSchema.safeParse(validRequest)

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.email).toBe('camille@example.fr')
    expect(parsed.data.message).toBe('Bonjour,\n\nje souhaite un devis.')
    expect(parsed.data.subject).toBe('quote')
  })

  it('keeps the line breaks of the message and strips the other control characters', () => {
    const parsed = ContactRequestSchema.safeParse({
      ...validRequest,
      message: 'Bonjour,\nvoici mon besoin : un site\u0007 vitrine.',
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.message).toContain('\n')
    expect(parsed.data.message).not.toContain('\u0007')
  })

  it('removes the control characters of a single-line field, so no labelled line can be forged', () => {
    const parsed = ContactRequestSchema.safeParse({ ...validRequest, firstName: 'Camille\nNom : Pirate' })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.firstName).toBe('CamilleNom : Pirate')
  })

  it('refuses a message under the minimum, a missing consent and an unknown subject', () => {
    expect(ContactRequestSchema.safeParse({ ...validRequest, message: 'court' }).success).toBe(false)
    expect(ContactRequestSchema.safeParse({ ...validRequest, consent: false }).success).toBe(false)
    expect(ContactRequestSchema.safeParse({ ...validRequest, subject: 'spam' }).success).toBe(false)
  })

  it('requires the Altcha payload, and bounds it', () => {
    expect(ContactRequestSchema.safeParse({ ...validRequest, altcha: '' }).success).toBe(false)
    expect(ContactRequestSchema.safeParse({ ...validRequest, altcha: 'a'.repeat(4001) }).success).toBe(false)
  })

  it('defaults the honeypot and the render timestamp, so a client that sends neither stays valid', () => {
    const body: Record<string, unknown> = { ...validRequest }
    delete body.reference
    delete body.renderedAt
    const parsed = ContactRequestSchema.safeParse(body)

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.reference).toBe('')
    expect(parsed.data.renderedAt).toBe('')
  })
})
