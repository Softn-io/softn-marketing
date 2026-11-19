// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SITE_ROUTES } from '@/lib/routes'
import { chatbot } from '@/locales/fr/chatbot'
import { contact } from '@/locales/fr/contact'
import { cookiesContent, mentionsContent, privacyContent } from '../index'
import { LegalPage } from '../LegalPage'
import styles from '../styles/LegalPage.module.css'

afterEach(cleanup)

/** Every rendered paragraph of the page, in document order. */
const paragraphs = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll(`p.${styles.paragraph}`))

describe('LegalPage', () => {
  it('renders a main landmark with exactly one h1 and one h2 per section, never a skipped level', () => {
    render(<LegalPage {...privacyContent} />)

    expect(screen.getByRole('main')).toBeTruthy()
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    expect(headings.filter((heading) => heading.tagName === 'H1')).toHaveLength(1)
    expect(headings.filter((heading) => heading.tagName === 'H2')).toHaveLength(privacyContent.sections.length)
    expect(headings.filter((heading) => heading.tagName !== 'H1' && heading.tagName !== 'H2')).toHaveLength(0)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(privacyContent.title)
  })

  it('renders the last-updated line under the title', () => {
    render(<LegalPage {...mentionsContent} />)

    expect(screen.getByText(mentionsContent.updated)).toBeTruthy()
  })

  it('renders the intro when the copy carries one, and nothing when it does not', () => {
    render(<LegalPage {...privacyContent} />)
    expect(screen.getByText(privacyContent.intro ?? '')).toBeTruthy()
    cleanup()

    const { container } = render(<LegalPage {...mentionsContent} />)
    expect(container.querySelectorAll(`.${styles.intro}`)).toHaveLength(0)
  })

  it('renders every section title as its own h2, in copy order', () => {
    render(<LegalPage {...mentionsContent} />)

    const titles = Array.from(document.querySelectorAll('h2')).map((heading) => heading.textContent)
    expect(titles).toEqual(mentionsContent.sections.map((section) => section.title))
  })

  it('renders {contactPageLink} as a real link to the contact page, labelled « page de contact »', () => {
    render(<LegalPage {...mentionsContent} />)

    const link = screen.getByRole('link', { name: chatbot.contactPageLinkLabel })
    expect(link.getAttribute('href')).toBe(SITE_ROUTES.contact)
    expect(link.className).toContain(styles.link)
    // The sentence stays one paragraph; the link sits inside it, inline.
    expect(link.closest('p')).toBeTruthy()
    expect(link.closest('p')?.className).toContain(styles.paragraph)
  })

  it("renders {dataRequestSubject} with the contact form's own option wording, as plain text", () => {
    const { container } = render(<LegalPage {...privacyContent} />)

    const expected = contact.form.subject.options.dataRequest
    const carrying = paragraphs(container).filter((paragraph) => paragraph.textContent?.includes(expected))
    expect(carrying).toHaveLength(1)
    // The value is text inside the sentence, never a link of its own.
    expect(screen.queryByRole('link', { name: expected })).toBeNull()
  })

  it('renders a \\n line break inside one paragraph, as one text node for the pre-line rule', () => {
    const { container } = render(<LegalPage {...mentionsContent} />)

    const template = mentionsContent.sections[0]?.paragraphs[0] ?? ''
    const paragraph = paragraphs(container).find((element) => element.textContent?.startsWith('Le site softn.io'))
    expect(paragraph).toBeTruthy()
    expect(paragraph?.textContent).toBe(template)
    expect(paragraph?.textContent).toContain('\n')
    expect(paragraph?.className).toContain(styles.paragraph)
    // No sentence assembled from fragments and no <br>: the paragraph stays one element, one node.
    expect(paragraph?.children).toHaveLength(0)
    expect(paragraph?.childNodes).toHaveLength(1)
  })

  it('renders a paragraph without placeholder as plain text, with no link', () => {
    render(<LegalPage {...mentionsContent} />)

    const paragraph = screen.getByText(mentionsContent.sections[1]?.paragraphs[0] ?? '')
    expect(paragraph.className).toContain(styles.paragraph)
    expect(paragraph.querySelector('a')).toBeNull()
  })

  it('renders no link on the cookie policy, whose copy holds no placeholder', () => {
    const { container } = render(<LegalPage {...cookiesContent} />)

    expect(container.querySelectorAll('a')).toHaveLength(0)
    expect(paragraphs(container).length).toBeGreaterThan(0)
  })

  it('fails closed when the copy carries a placeholder no value answers', () => {
    const broken = {
      ...mentionsContent,
      sections: [
        {
          title: 'Section',
          paragraphs: ['Cette phrase cite {placeholderInconnu} sans valeur.'],
        },
      ],
    }

    // Suppress React's error-console noise for the expected throw; the assertion is the throw.
    const consoleError = console.error
    console.error = () => undefined
    try {
      expect(() => render(<LegalPage {...broken} />)).toThrow('Missing interpolation value')
    } finally {
      console.error = consoleError
      cleanup()
    }
  })
})
