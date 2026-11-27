import { describe, expect, it } from 'vitest'
import { legal } from '@/locales/fr/legal'
import { cookiesContent, mentionsContent, privacyContent } from '../data/legalSections'

/** Placeholders the copy may use; anything else would throw at render time (fail closed). */
const KNOWN_PLACEHOLDERS = ['contactPageLink', 'dataRequestSubject'] as const

const CONTENTS = [
  { name: 'mentions', content: mentionsContent, locale: legal.mentions, updatedAt: '30/11/2026' },
  { name: 'privacy', content: privacyContent, locale: legal.privacy, updatedAt: '27/11/2026' },
  { name: 'cookies', content: cookiesContent, locale: legal.cookies, updatedAt: '27/11/2026' },
] as const

describe('legalSections', () => {
  it.each(CONTENTS)(
    '$name: the {date} parameter is filled with $updatedAt, the ISO date written the French way',
    ({ content, updatedAt }) => {
      expect(content.updated).toBe(`Dernière mise à jour : ${updatedAt}`)
    },
  )

  it.each(CONTENTS)('$name: the title and every section come from the locale, in its order', ({ content, locale }) => {
    expect(content.title).toBe(locale.title)
    expect(content.sections.map((section) => section.title)).toEqual(
      Object.values(locale.sections).map((section) => section.title),
    )
    for (const section of content.sections) {
      expect(section.paragraphs.length).toBeGreaterThan(0)
      for (const paragraph of section.paragraphs) {
        expect(paragraph.length).toBeGreaterThan(0)
      }
    }
  })

  it('privacy: the purposes section carries the call paragraph that announces the written notice', () => {
    const purposes = privacyContent.sections.find((section) => section.title === legal.privacy.sections.purposes.title)
    expect(purposes?.paragraphs).toContain(legal.privacy.purposes.call)
    // Issue #154: the person is informed in writing in the booking e-mails, then at the start of
    // the call, and may object by replying to one of these e-mails or orally.
    expect(legal.privacy.purposes.call).toContain('informée par écrit dans les e-mails de réservation')
    expect(legal.privacy.purposes.call).toContain('désactivée, en répondant')
  })

  it('privacy: the transfers section no longer lists Umami as a US provider', () => {
    const transfers = privacyContent.sections.find(
      (section) => section.title === legal.privacy.sections.transfers.title,
    )
    expect(transfers?.paragraphs).toEqual([legal.privacy.sections.transfers.body])
    // The US list keeps only the established providers; Umami is self-hosted software on Vercel
    // and its data live in Supabase, so both stay covered by the Vercel and Supabase DPAs.
    expect(legal.privacy.sections.transfers.body).toContain('(États-Unis) : Upstash, Vercel, Google et Supabase.')
    expect(legal.privacy.sections.transfers.body).not.toContain('Umami (hébergé sur Vercel)')
    expect(legal.privacy.sections.transfers.body).toContain(
      "L'outil de mesure d'audience Umami est auto-hébergé sur Vercel, et ses données sont stockées chez Supabase.",
    )
  })

  it('privacy and cookies: the audience copy discloses the hashed-IP processing', () => {
    // The collected-data paragraph and the cookie tracker paragraph both state the same behaviour:
    // the IP is processed hashed to count sessions and estimate an approximate location, never kept.
    expect(legal.privacy.collected.audience).toContain(
      "l'adresse IP est traitée sous forme hachée ; elle n'est pas conservée",
    )
    expect(legal.privacy.collected.audience).toContain('localisation approximative')
    expect(legal.cookies.audience.tracker).toContain("il traite l'adresse IP sous forme hachée, sans la conserver")
    expect(legal.cookies.audience.tracker).toContain('localisation approximative')
  })

  it('privacy: the service e-mails section discloses the internal notification of the booking moments', () => {
    const emails = privacyContent.sections.find((section) => section.title === legal.privacy.sections.emails.title)
    expect(emails?.paragraphs).toContain(legal.privacy.emails.body)
    // Issue #168: every booking, reschedule and cancellation also sends Softn.io an internal
    // notification with the answers of the booking, and it stays in Softn.io's inbox.
    expect(legal.privacy.emails.body).toContain('donne aussi lieu à une notification interne')
    expect(legal.privacy.emails.body).toContain('reste dans la boîte de réception de Softn.io')
  })

  it('privacy: the rate-limit retention names the assistant, the booking and the contact windows', () => {
    // The 60 s window is the assistant policy, shared with the booking routes; the contact form
    // and its anti-bot identifiers keep 10 minutes.
    expect(legal.privacy.retention.rateLimit).toContain("60 secondes pour l'assistant et la réservation")
    expect(legal.privacy.retention.rateLimit).toContain('10 minutes pour le formulaire de contact')
    expect(legal.privacy.retention.rateLimit).toContain('Identifiants de la vérification anti-robot : 10 minutes')
  })

  it.each(CONTENTS)('$name: every placeholder the copy uses is one the renderer answers', ({ content }) => {
    const texts = [
      ...(content.intro === undefined ? [] : [content.intro]),
      ...content.sections.flatMap((section) => [
        ...(section.intro === undefined ? [] : [section.intro]),
        ...section.paragraphs,
      ]),
    ]
    for (const text of texts) {
      for (const match of text.matchAll(/\{(\w+)\}/g)) {
        const name: string = match[1] ?? ''
        expect(KNOWN_PLACEHOLDERS as readonly string[], `unknown placeholder {${name}}`).toContain(name)
      }
    }
  })
})
