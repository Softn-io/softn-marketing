import { interpolate } from '@/lib/interpolate'
import { legal } from '@/locales/fr/legal'

/**
 * Publication date of the three legal pages, ISO so the copy holds no hand-written date: the
 * `{date}` parameter of `locales/fr/legal.ts` is filled with it, once, for every page. `UTC` keeps
 * the prerendered line identical whatever the machine that builds the site.
 */
const LEGAL_UPDATED_AT = '2026-11-30'

/** The copy's `{date}` value: that date, written the French way. */
const updatedAt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC' }).format(new Date(LEGAL_UPDATED_AT))

/** One section of a legal page: a level-2 heading, an optional intro, then its paragraphs. */
export type LegalSection = {
  /** Heading of the section, rendered as the page's `h2`. */
  readonly title: string
  /** Sentence that introduces the paragraphs, when the copy carries one. */
  readonly intro?: string
  /** Paragraphs in copy order; each is a whole template, never a fragment to join, its `\n` a line break. */
  readonly paragraphs: readonly string[]
}

/** Title and sections of one legal page, ready for the shared renderer. */
export type LegalPageContent = {
  /** Page title, rendered as the page's only `h1`. */
  readonly title: string
  /** Last-updated line the copy carries, rendered under the title. */
  readonly updated: string
  /** Sentence that introduces the whole page, when the copy carries one. */
  readonly intro?: string
  readonly sections: readonly LegalSection[]
}

/** Legal notice: identity of the publisher and the host, and the intellectual-property credit. */
export const mentionsContent: LegalPageContent = {
  title: legal.mentions.title,
  updated: interpolate(legal.mentions.updated, { date: updatedAt }),
  sections: [
    {
      title: legal.mentions.sections.publisher.title,
      paragraphs: [
        legal.mentions.sections.publisher.body,
        legal.mentions.publisher.siret,
        legal.mentions.publisher.vat,
        legal.mentions.publisher.address,
        legal.mentions.publisher.contact,
      ],
    },
    {
      title: legal.mentions.sections.director.title,
      paragraphs: [legal.mentions.sections.director.body],
    },
    {
      title: legal.mentions.sections.host.title,
      paragraphs: [legal.mentions.sections.host.body],
    },
    {
      title: legal.mentions.sections.ip.title,
      paragraphs: [legal.mentions.sections.ip.body],
    },
    {
      title: legal.mentions.sections.data.title,
      paragraphs: [legal.mentions.sections.data.body],
    },
  ],
}

/** Privacy policy: the data collected, why, by whom, for how long, and how to exercise one's rights. */
export const privacyContent: LegalPageContent = {
  title: legal.privacy.title,
  updated: interpolate(legal.privacy.updated, { date: updatedAt }),
  intro: legal.privacy.intro,
  sections: [
    {
      title: legal.privacy.sections.controller.title,
      paragraphs: [legal.privacy.sections.controller.body],
    },
    {
      title: legal.privacy.sections.collected.title,
      intro: legal.privacy.sections.collected.intro,
      paragraphs: [
        legal.privacy.collected.booking,
        legal.privacy.collected.call,
        legal.privacy.collected.contact,
        legal.privacy.collected.waitlist,
        legal.privacy.collected.technical,
        legal.privacy.collected.audience,
      ],
    },
    {
      title: legal.privacy.sections.purposes.title,
      paragraphs: [
        legal.privacy.purposes.booking,
        legal.privacy.purposes.call,
        legal.privacy.purposes.contact,
        legal.privacy.purposes.waitlist,
        legal.privacy.purposes.technical,
        legal.privacy.purposes.audience,
      ],
    },
    {
      title: legal.privacy.sections.processors.title,
      intro: legal.privacy.processors.intro,
      paragraphs: [
        legal.privacy.processors.baserow,
        legal.privacy.processors.mistral,
        legal.privacy.processors.upstash,
        legal.privacy.processors.google,
        legal.privacy.processors.meet,
        legal.privacy.processors.vercel,
        legal.privacy.processors.umami,
        legal.privacy.processors.supabase,
      ],
    },
    {
      title: legal.privacy.sections.transfers.title,
      paragraphs: [legal.privacy.sections.transfers.body],
    },
    {
      title: legal.privacy.sections.retention.title,
      paragraphs: [
        legal.privacy.retention.lead,
        legal.privacy.retention.client,
        legal.privacy.retention.call,
        legal.privacy.retention.contactMessage,
        legal.privacy.retention.waitlist,
        legal.privacy.retention.logs,
        legal.privacy.retention.rateLimit,
        legal.privacy.retention.consent,
      ],
    },
    {
      title: legal.privacy.sections.rights.title,
      paragraphs: [legal.privacy.rights.list, legal.privacy.rights.how, legal.privacy.rights.complaint],
    },
    {
      title: legal.privacy.sections.security.title,
      paragraphs: [legal.privacy.security.body],
    },
    {
      title: legal.privacy.sections.ai.title,
      paragraphs: [legal.privacy.ai.body],
    },
    {
      title: legal.privacy.sections.emails.title,
      paragraphs: [legal.privacy.emails.body],
    },
    {
      title: legal.privacy.sections.changes.title,
      paragraphs: [legal.privacy.changes.body],
    },
  ],
}

/** Cookie policy: what the site stores today, the audience measurement, and how the choice works. */
export const cookiesContent: LegalPageContent = {
  title: legal.cookies.title,
  updated: interpolate(legal.cookies.updated, { date: updatedAt }),
  intro: legal.cookies.intro,
  sections: [
    {
      title: legal.cookies.sections.necessary.title,
      paragraphs: [legal.cookies.necessary.body],
    },
    {
      title: legal.cookies.sections.audience.title,
      paragraphs: [legal.cookies.audience.body],
    },
    {
      title: legal.cookies.sections.thirdParty.title,
      paragraphs: [legal.cookies.thirdParty.body],
    },
    {
      title: legal.cookies.sections.choice.title,
      paragraphs: [legal.cookies.choice.body, legal.cookies.choice.duration],
    },
    {
      title: legal.cookies.sections.browser.title,
      paragraphs: [legal.cookies.browser.body],
    },
  ],
}
