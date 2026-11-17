// @vitest-environment jsdom
/*
 * Behaviour of the contact form island: the validation timing, the invalid submit, the anti-bot
 * gate, the accepted message it reports and the two failures the copy words. The Altcha widget is mocked
 * here: it is a custom element of its own chunk, covered by `ContactAltcha.test.tsx`, and this file
 * only needs the hidden payload input it writes into the form.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { contact } from '@/locales/fr/contact'
import { CONTACT_FIELDS, CONTACT_MESSAGE_MIN_LENGTH, CONTACT_MIN_FILL_MS } from '@/schemas/contactLimits'
import { ContactForm } from '../ContactForm'

const altchaMock = vi.hoisted(() => ({ payload: 'solved-payload', resetToken: 0 }))

vi.mock('../ContactAltcha', async () => {
  const { createElement } = await import('react')

  return {
    ContactAltcha: ({ resetToken, onStateChange }: { resetToken: number; onStateChange: (state: string) => void }) => {
      altchaMock.resetToken = resetToken
      useEffect(() => {
        onStateChange(altchaMock.payload === '' ? 'unverified' : 'verified')
      }, [onStateChange, resetToken])

      return createElement(
        'div',
        { 'data-testid': 'altcha-mount' },
        altchaMock.payload === ''
          ? null
          : createElement('input', {
              type: 'hidden',
              name: 'altcha',
              value: altchaMock.payload,
              readOnly: true,
            }),
      )
    },
  }
})

const fetchMock = vi.fn<typeof fetch>()

/** Callback the screen gives the form: it reports an accepted message with the visitor's first name. */
const onSent = vi.fn<(firstName: string) => void>()

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Body the form sent, as JSON. */
const sentBody = (): Record<string, unknown> => {
  const [, init] = fetchMock.mock.calls[0] ?? []
  return JSON.parse(String(init?.body)) as Record<string, unknown>
}

/** Fills the form with a valid message. */
const fillValidForm = (): void => {
  fireEvent.change(screen.getByLabelText(contact.form.firstName.label), { target: { value: 'Camille' } })
  fireEvent.change(screen.getByLabelText(contact.form.lastName.label), { target: { value: 'Durand' } })
  fireEvent.change(screen.getByLabelText(contact.form.email.label), { target: { value: 'camille@example.fr' } })
  fireEvent.change(screen.getByLabelText(contact.form.subject.label), { target: { value: 'quote' } })
  fireEvent.change(screen.getByLabelText(contact.form.message.label), {
    target: { value: 'a'.repeat(CONTACT_MESSAGE_MIN_LENGTH) },
  })
  fireEvent.click(screen.getByLabelText(contact.consent.checkbox.label))
}

/** Waits for the Altcha chunk, then sends the form after the minimum fill time. */
const submit = async (): Promise<void> => {
  await screen.findByTestId('altcha-mount')
  await act(async () => {
    vi.advanceTimersByTime(CONTACT_MIN_FILL_MS + 1000)
  })
  fireEvent.submit(screen.getByRole('form'))
}

/** Sends the form as soon as it is mounted, which is what the minimum fill time refuses. */
const submitImmediately = async (): Promise<void> => {
  await screen.findByTestId('altcha-mount')
  fireEvent.submit(screen.getByRole('form'))
}

beforeEach(() => {
  altchaMock.payload = 'solved-payload'
  altchaMock.resetToken = 0
  onSent.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue(jsonResponse({ sent: true }))
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('ContactForm validation timing', () => {
  it('shows a problem 1000 ms after the last keystroke, and hides it while typing again', async () => {
    render(<ContactForm onSent={onSent} />)
    const email = screen.getByLabelText(contact.form.email.label)

    fireEvent.change(email, { target: { value: 'pas-un-email' } })
    expect(screen.queryByText(contact.errors.email.invalid)).toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText(contact.errors.email.invalid)).toBeTruthy()

    fireEvent.change(email, { target: { value: 'pas-un-email.fr' } })
    expect(screen.queryByText(contact.errors.email.invalid)).toBeNull()
  })

  it('checks a filled field 1000 ms after it loses focus, not at once', async () => {
    render(<ContactForm onSent={onSent} />)
    const email = screen.getByLabelText(contact.form.email.label)

    fireEvent.change(email, { target: { value: 'pas-un-email' } })
    fireEvent.blur(email)

    expect(screen.queryByText(contact.errors.email.invalid)).toBeNull()
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText(contact.errors.email.invalid)).toBeTruthy()
  })

  it('leaves a field the visitor never filled quiet, on blur and after the delay', async () => {
    render(<ContactForm onSent={onSent} />)
    const firstName = screen.getByLabelText(contact.form.firstName.label)

    fireEvent.blur(firstName)
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    expect(screen.queryByText(contact.errors.firstName.required)).toBeNull()
  })

  it('keeps the required message of a field that was emptied, after the delay, while it keeps focus', async () => {
    render(<ContactForm onSent={onSent} />)
    const lastName = screen.getByLabelText(contact.form.lastName.label)

    lastName.focus()
    fireEvent.change(lastName, { target: { value: 'Durand' } })
    fireEvent.change(lastName, { target: { value: '' } })
    expect(screen.queryByText(contact.errors.lastName.required)).toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    expect(screen.getByText(contact.errors.lastName.required)).toBeTruthy()
    expect(document.activeElement).toBe(lastName)
  })

  it('validates the subject as soon as one is picked', () => {
    render(<ContactForm onSent={onSent} />)

    const subject = screen.getByLabelText(contact.form.subject.label)
    fireEvent.change(subject, { target: { value: '' } })
    expect(screen.getByText(contact.errors.subject.required)).toBeTruthy()
    fireEvent.change(subject, { target: { value: 'other' } })
    expect(screen.queryByText(contact.errors.subject.required)).toBeNull()
  })

  it('marks every control required: the native attribute, and the group description for the widget', () => {
    render(<ContactForm onSent={onSent} />)

    for (const label of [
      contact.form.firstName.label,
      contact.form.lastName.label,
      contact.form.email.label,
      contact.form.subject.label,
      contact.form.message.label,
      contact.consent.checkbox.label,
    ]) {
      expect(screen.getByLabelText(label)).toHaveProperty('required', true)
    }

    // The anti-bot control belongs to the widget, so its group cannot carry `required`: the
    // requirement travels on the description, next to the note the form shows at the top.
    const group = screen.getByRole('group', { name: contact.form.altcha.title })
    const describedBy = (group.getAttribute('aria-describedby') ?? '').split(' ')
    const note = screen.getByText(contact.form.requiredNote)
    expect(note.id).not.toBe('')
    expect(describedBy).toContain(note.id)
  })

  it('shows the help of the personal-data subject only when it is picked', () => {
    render(<ContactForm onSent={onSent} />)

    expect(screen.queryByText(/droit que vous souhaitez exercer/)).toBeNull()
    fireEvent.change(screen.getByLabelText(contact.form.subject.label), { target: { value: 'dataRequest' } })
    expect(screen.getByText(/droit que vous souhaitez exercer/)).toBeTruthy()
  })

  it('keeps the consent control a native checkbox: no role of its own, and it toggles on click', () => {
    render(<ContactForm onSent={onSent} />)
    const consent = screen.getByLabelText(contact.consent.checkbox.label)

    expect(consent).toHaveProperty('type', 'checkbox')
    expect(consent.getAttribute('role')).toBeNull()

    fireEvent.click(consent)
    expect(consent).toHaveProperty('checked', true)
    fireEvent.click(consent)
    expect(consent).toHaveProperty('checked', false)
  })
})

describe('ContactForm invalid submit', () => {
  it('reveals every problem and focuses the first field to fix', async () => {
    render(<ContactForm onSent={onSent} />)
    await submit()

    expect(screen.getByText(contact.errors.firstName.required)).toBeTruthy()
    expect(screen.getByText(contact.errors.lastName.required)).toBeTruthy()
    expect(screen.getByText(contact.errors.email.required)).toBeTruthy()
    expect(screen.getByText(contact.errors.subject.required)).toBeTruthy()
    expect(screen.getByText(contact.errors.message.required)).toBeTruthy()
    expect(screen.getByText(contact.errors.consent)).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText(contact.form.firstName.label))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('asks for the anti-bot check when no payload was solved, and focuses its group', async () => {
    altchaMock.payload = ''
    render(<ContactForm onSent={onSent} />)
    fillValidForm()
    await submit()

    expect(screen.getByText(contact.errors.altcha.required)).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('group', { name: contact.form.altcha.title }))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('ContactForm submit button', () => {
  it('announces the button as disabled while the form is empty, and links it to the required note', async () => {
    render(<ContactForm onSent={onSent} />)
    const button = await screen.findByRole('button', { name: contact.form.submit })

    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button).toHaveProperty('disabled', false)
    const describedBy = (button.getAttribute('aria-describedby') ?? '').split(' ')
    expect(describedBy).toContain(screen.getByText(contact.form.requiredNote).id)
  })

  it('enables the button once every field is valid and the anti-bot check passed', async () => {
    render(<ContactForm onSent={onSent} />)
    fillValidForm()
    await screen.findByTestId('altcha-mount')

    const button = await screen.findByRole('button', { name: contact.form.submit })
    expect(button.getAttribute('aria-disabled')).toBeNull()
    expect(button.getAttribute('aria-describedby')).toBeNull()
  })

  it('keeps the button announced as disabled while the anti-bot check is unsolved', async () => {
    altchaMock.payload = ''
    render(<ContactForm onSent={onSent} />)
    fillValidForm()
    await screen.findByTestId('altcha-mount')

    expect(screen.getByRole('button', { name: contact.form.submit }).getAttribute('aria-disabled')).toBe('true')
  })

  it('reveals every error and focuses the first field when the disabled button is activated, without sending', async () => {
    render(<ContactForm onSent={onSent} />)
    const button = await screen.findByRole('button', { name: contact.form.submit })
    // Past the minimum fill time, so the activation reaches the validation instead of the trap.
    await act(async () => {
      vi.advanceTimersByTime(CONTACT_MIN_FILL_MS + 1000)
    })
    fireEvent.click(button)

    expect(await screen.findByText(contact.errors.firstName.required)).toBeTruthy()
    expect(screen.getByText(contact.errors.consent)).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText(contact.form.firstName.label))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('ContactForm submission', () => {
  it('sends the answers once the form is complete, and reports the first name', async () => {
    render(<ContactForm onSent={onSent} />)
    fillValidForm()
    await submit()

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('/api/contact')
    expect(init?.method).toBe('POST')
    expect(sentBody()).toMatchObject({
      firstName: 'Camille',
      lastName: 'Durand',
      email: 'camille@example.fr',
      subject: 'quote',
      consent: true,
      altcha: 'solved-payload',
    })
    expect(sentBody()[CONTACT_FIELDS.honeypot]).toBe('')

    // The screen, not the form, renders the confirmation: the form only reports the name.
    await waitFor(() => {
      expect(onSent).toHaveBeenCalledWith('Camille')
    })
    expect(screen.queryByText(contact.success.title)).toBeNull()
  })

  it('answers the honeypot with the reported name, without a network call', async () => {
    const { container } = render(<ContactForm onSent={onSent} />)
    fillValidForm()
    const honeypot = container.querySelector(`input[name="${CONTACT_FIELDS.honeypot}"]`)
    if (honeypot === null) throw new Error('the honeypot field should exist')
    fireEvent.change(honeypot, { target: { value: 'https://spam.example' } })

    await submit()

    await waitFor(() => {
      expect(onSent).toHaveBeenCalledWith('Camille')
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers a form submitted too fast with the reported name, without a network call', async () => {
    render(<ContactForm onSent={onSent} />)
    fillValidForm()

    await submitImmediately()

    await waitFor(() => {
      expect(onSent).toHaveBeenCalledWith('Camille')
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the rate-limit copy and keeps the answers, with a retry that sends again', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'rate-limited' }, 429))
    render(<ContactForm onSent={onSent} />)
    fillValidForm()
    await submit()

    expect(await screen.findByText(contact.error.rateLimit.body)).toBeTruthy()
    expect(screen.getByText(contact.error.dataKept)).toBeTruthy()
    expect(screen.getByLabelText(contact.form.message.label)).toHaveProperty('value', 'a'.repeat(10))

    fireEvent.click(screen.getByRole('button', { name: contact.error.retry }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  it('asks the widget for a fresh challenge after a failure that spent the payload', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'unavailable' }, 503))
    render(<ContactForm onSent={onSent} />)
    fillValidForm()
    await submit()

    expect(await screen.findByText(contact.fallback.unavailable)).toBeTruthy()
    expect(altchaMock.resetToken).toBe(1)
  })

  it('leaves the solved payload alone when the rate limit refused the submission before it was spent', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'rate-limited' }, 429))
    render(<ContactForm onSent={onSent} />)
    fillValidForm()
    await submit()

    expect(await screen.findByText(contact.error.rateLimit.body)).toBeTruthy()
    expect(altchaMock.resetToken).toBe(0)
  })

  it('shows the connection copy when the request never reaches the server', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    render(<ContactForm onSent={onSent} />)
    fillValidForm()
    await submit()

    expect(await screen.findByText(contact.error.network.body)).toBeTruthy()
  })

  it('shows the generic incident copy when the server refuses the submission', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'invalid' }, 400))
    render(<ContactForm onSent={onSent} />)
    fillValidForm()
    await submit()

    expect(await screen.findByText(contact.error.generic.body)).toBeTruthy()
  })
})
