// @vitest-environment jsdom
/*
 * The contact screen: the client boundary that owns the page heading, its intro and the form state.
 * The form is mocked here — its own behaviour is covered by `ContactForm.test.tsx` — so these tests
 * observe one thing: what the screen renders once the form reports an accepted message, and where
 * the focus and the announcement land.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { contact } from '@/locales/fr/contact'
import { ContactScreen } from '../ContactScreen'

const formMock = vi.hoisted(() => ({ onSent: undefined as ((firstName: string) => void) | undefined }))

vi.mock('../ContactForm', async () => {
  const { createElement } = await import('react')

  return {
    ContactForm: ({ onSent }: { onSent: (firstName: string) => void }) => {
      formMock.onSent = onSent
      return createElement('button', { type: 'button', onClick: () => onSent('Camille') }, 'submit the form')
    },
  }
})

const TITLE = contact.title
const INTRO = 'Une question, une demande de devis ou un projet à décrire.'

const renderScreen = () =>
  render(<ContactScreen eyebrow={contact.eyebrow} title={TITLE} intro={<span>{INTRO}</span>} />)

afterEach(cleanup)

describe('ContactScreen', () => {
  it('shows the heading and the intro of the page while the form is there', () => {
    renderScreen()

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(TITLE)
    expect(screen.getByText(INTRO)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'submit the form' })).toBeTruthy()
    expect(screen.queryByText(contact.success.backLink)).toBeNull()
  })

  it('replaces the heading and the intro with the confirmation, keeping one h1 and the back link', () => {
    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'submit the form' }))

    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]?.textContent).toBe(contact.success.title)
    expect(screen.queryByText(TITLE)).toBeNull()
    expect(screen.queryByText(INTRO)).toBeNull()
    // The body is one copy string with the first name emphasised, so its text is read whole.
    const body = screen.getByText(/Votre message a bien été envoyé/)
    expect(body.textContent).toBe(contact.success.body.replace('{firstName}', 'Camille'))
    expect(screen.getByText('Camille')).toBeTruthy()
    expect(screen.getByRole('link', { name: contact.success.backLink })).toHaveProperty('pathname', '/')
    // The form is gone, and the live region announces the sent status.
    expect(screen.queryByRole('button', { name: 'submit the form' })).toBeNull()
    expect(screen.getByRole('status').textContent).toBe(contact.a11y.status.sent)
  })

  it('moves focus to the new heading', () => {
    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'submit the form' }))

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveProperty('tabIndex', -1)
    expect(document.activeElement).toBe(heading)
  })

  it('announces nothing before the message is accepted', () => {
    renderScreen()

    expect(screen.getByRole('status').textContent).toBe('')
  })
})
