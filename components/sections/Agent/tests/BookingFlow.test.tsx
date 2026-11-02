// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { agent } from '@/locales/fr/agent'
import { chatbot } from '@/locales/fr/chatbot'
import { BookingFlow, type BookingFlowProps } from '../BookingFlow'
import { BOOKING_TYPING_DELAY_MS } from '../hooks/useBookingFlow'
import {
  answerBooking,
  beforeContactLink,
  callsTo,
  jsonResponse,
  plainSpaces,
  renderedConsentMessage,
  SLOTS,
  slotsCalls,
  stubMotionPreference,
} from './bookingTestUtils'

const fetchMock = vi.fn<typeof fetch>()

const onCancel = vi.fn()
const onDecline = vi.fn()
const onRestart = vi.fn()

/** Mounts the flow alone: its own state, its own transcript, no lazy chunk in the way. */
const renderFlow = (props: Partial<BookingFlowProps> = {}) =>
  render(
    <BookingFlow
      onCancel={props.onCancel ?? onCancel}
      onDecline={props.onDecline ?? onDecline}
      onRestart={props.onRestart ?? onRestart}
    />,
  )

const region = (): HTMLElement => screen.getByRole('region', { name: chatbot.suggestions.book })

/** Lines of the transcript, in render order. */
const transcript = (): readonly HTMLElement[] => [
  ...region().querySelectorAll<HTMLElement>('[data-booking-transcript] > li'),
]

const transcriptTexts = (): readonly string[] => transcript().map((line) => line.textContent ?? '')

const typingIndicator = (): HTMLElement | null => region().querySelector('[data-booking-typing]')

const slotChips = (): readonly HTMLElement[] => [...region().querySelectorAll<HTMLElement>('[data-booking-slot]')]

/** Writes into a field, found by its label or given directly. */
const typeIn = (field: string | HTMLElement, value: string): void => {
  fireEvent.change(typeof field === 'string' ? screen.getByLabelText(field) : field, { target: { value } })
}

const send = (): void => {
  fireEvent.click(screen.getByRole('button', { name: agent.sendLabel }))
}

/** Advances the flow by whole pauses: one assistant message per pause, with its visitor lines. */
const settle = async (pauses = 1): Promise<void> => {
  for (let index = 0; index < pauses; index += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BOOKING_TYPING_DELAY_MS)
    })
  }
}

/**
 * Walks every step up to the recap without pacing: the motion preference is reduced, so each message
 * is revealed as soon as it exists and the assertions read the flow's behaviour, not its rhythm.
 */
const answerUpToRecap = async (answers: {
  need?: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
}): Promise<void> => {
  fireEvent.click(await screen.findByRole('button', { name: chatbot.consent.accept }))
  typeIn(await screen.findByLabelText(chatbot.booking.steps.need.field), answers.need ?? 'Automatiser mes devis')
  send()
  await waitFor(() => expect(slotChips().length).toBeGreaterThan(0))
  fireEvent.click(slotChips()[0] as HTMLElement)
  typeIn(await screen.findByLabelText(chatbot.booking.steps.firstName.field), answers.firstName ?? 'Marie')
  send()
  typeIn(await screen.findByLabelText(chatbot.booking.steps.lastName.field), answers.lastName ?? 'Dupont')
  send()
  typeIn(await screen.findByLabelText(chatbot.booking.steps.email.field), answers.email ?? 'marie@example.fr')
  send()
  const phoneField = await screen.findByLabelText(chatbot.booking.steps.phone.field)
  if (answers.phone !== undefined) {
    fireEvent.change(phoneField, { target: { value: answers.phone } })
    send()
  } else {
    fireEvent.click(screen.getAllByRole('button', { name: chatbot.booking.steps.skip })[0] as HTMLElement)
  }
  fireEvent.click(await screen.findByRole('button', { name: 'PME' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Marketing' }))
  await screen.findByText(chatbot.booking.recap.title)
}

/** True when `first` comes before `second` in the document, the order a screen reader follows. */
const comesBefore = (first: Element | null, second: Element | null): boolean =>
  first !== null && second !== null && Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)

/** Stubs the scroll the chooser asks for on opening below md, and returns the spy. */
const stubScrollIntoView = (): ReturnType<typeof vi.fn> => {
  const spy = vi.fn()
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: spy })
  return spy
}

/** Walks from the consent to the e-mail step, leaving the e-mail field empty. */
const walkToEmailStep = async (): Promise<void> => {
  renderFlow()
  fireEvent.click(await screen.findByRole('button', { name: chatbot.consent.accept }))
  typeIn(await screen.findByLabelText(chatbot.booking.steps.need.field), 'Automatiser mes devis')
  send()
  await waitFor(() => expect(slotChips().length).toBeGreaterThan(0))
  fireEvent.click(slotChips()[0] as HTMLElement)
  typeIn(await screen.findByLabelText(chatbot.booking.steps.firstName.field), 'Marie')
  send()
  typeIn(await screen.findByLabelText(chatbot.booking.steps.lastName.field), 'Dupont')
  send()
}

/** Walks from the consent to the phone step, leaving the phone field empty. */
const walkToPhoneStep = async (): Promise<void> => {
  await walkToEmailStep()
  typeIn(await screen.findByLabelText(chatbot.booking.steps.email.field), 'marie@example.fr')
  send()
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  answerBooking(fetchMock)
  stubMotionPreference(true)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  onCancel.mockReset()
  onDecline.mockReset()
  onRestart.mockReset()
})

describe('Booking flow transcript', () => {
  it('keeps typed text out of the transcript until it is sent', async () => {
    renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: chatbot.consent.accept }))

    typeIn(await screen.findByLabelText(chatbot.booking.steps.need.field), 'Automatiser mes devis')

    expect(transcriptTexts().some((text) => text.includes('Automatiser mes devis'))).toBe(false)
    // The only visitor line is the accepted consent: its text is the speaker label plus that label,
    // so it is counted by its ending and not by a word the consent message also contains.
    expect(transcriptTexts().filter((text) => text.endsWith(chatbot.consent.accept))).toHaveLength(1)

    send()

    await waitFor(() => expect(transcriptTexts().some((text) => text.includes('Automatiser mes devis'))).toBe(true))
  })

  it('never shows the slot question before the need is answered', async () => {
    renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: chatbot.consent.accept }))
    const needField = await screen.findByLabelText(chatbot.booking.steps.need.field)

    expect(region().textContent).toContain(chatbot.booking.steps.need.question)
    expect(region().textContent).not.toContain(chatbot.booking.steps.slot.question)
    expect(slotChips()).toHaveLength(0)

    typeIn(needField, 'Automatiser mes devis')
    send()
    await waitFor(() => expect(slotChips().length).toBeGreaterThan(0))

    expect(region().textContent).toContain(chatbot.booking.steps.slot.question)
  })

  it('keeps the consent message, then the visitor answer, then the confirmation', async () => {
    renderFlow()

    expect((await screen.findByRole('button', { name: chatbot.consent.accept })).textContent).toBe(
      chatbot.consent.accept,
    )
    expect(region().textContent).toContain(renderedConsentMessage())

    fireEvent.click(screen.getByRole('button', { name: chatbot.consent.accept }))
    await waitFor(() => expect(region().textContent).toContain(chatbot.booking.steps.need.question))

    const texts = transcriptTexts()
    const messageIndex = texts.findIndex((text) => text.includes(renderedConsentMessage()))
    const answerIndex = texts.findIndex((text) => text.endsWith(chatbot.consent.accept))
    const acceptedIndex = texts.findIndex((text) => text.includes(chatbot.consent.accepted))

    expect(messageIndex).toBeGreaterThanOrEqual(0)
    expect(answerIndex).toBeGreaterThan(messageIndex)
    expect(acceptedIndex).toBeGreaterThan(answerIndex)
  })

  it('announces new lines in a polite live region', () => {
    renderFlow()

    const list = region().querySelector('[data-booking-transcript]')
    expect(list?.getAttribute('aria-live')).toBe('polite')
  })
})

describe('Booking flow pacing', () => {
  it('reveals one message per pause and hides the next control until then', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    stubMotionPreference(false)
    renderFlow()

    // The introduction is not on screen yet, and the assistant is already writing.
    expect(region().textContent).not.toContain(chatbot.booking.intro)
    expect(typingIndicator()).not.toBeNull()

    await settle(1)

    expect(region().textContent).toContain(chatbot.booking.intro)
    expect(region().textContent).not.toContain(renderedConsentMessage())
    expect(screen.queryByRole('button', { name: chatbot.consent.accept })).toBeNull()

    await settle(1)

    expect(region().textContent).toContain(renderedConsentMessage())
    expect(screen.getByRole('button', { name: chatbot.consent.accept })).toBeTruthy()

    // Accepting reveals the visitor line at once, then the next assistant message after its own
    // pause, and the field of the step only once its question is on screen.
    fireEvent.click(screen.getByRole('button', { name: chatbot.consent.accept }))
    await settle(1)

    expect(region().textContent).toContain(chatbot.consent.accept)
    expect(region().textContent).not.toContain(chatbot.consent.accepted)
    expect(screen.queryByLabelText(chatbot.booking.steps.need.field)).toBeNull()

    await settle(1)

    expect(region().textContent).toContain(chatbot.consent.accepted)
    expect(region().textContent).not.toContain(chatbot.booking.steps.need.question)
    expect(screen.queryByLabelText(chatbot.booking.steps.need.field)).toBeNull()
    expect(typingIndicator()).not.toBeNull()

    await settle(1)

    expect(region().textContent).toContain(chatbot.booking.steps.need.question)
    expect(screen.getByLabelText(chatbot.booking.steps.need.field)).toBeTruthy()
  })

  it('shows no typing indicator and no pause when motion is reduced', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    renderFlow()

    // A single millisecond is enough: nothing is scheduled behind a 700 ms pause.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(region().textContent).toContain(chatbot.booking.intro)
    expect(region().textContent).toContain(renderedConsentMessage())
    expect(typingIndicator()).toBeNull()
    expect(screen.getByRole('button', { name: chatbot.consent.accept })).toBeTruthy()
  })
})

describe('Booking flow scrolling', () => {
  /*
   * jsdom has no layout, so the boxes and the two lengths the scroll needs are stubbed: the newest
   * line sits at 700-760, the control of the step at 820-880, the header is absent, and the offset
   * token resolves to 96 px. The page must then be scrolled to 700 - 96 = 604.
   */
  const stubLayout = (): {
    readonly scrollTo: ReturnType<typeof vi.spyOn>
    readonly focus: ReturnType<typeof vi.spyOn>
  } => {
    const box = (top: number, bottom: number): DOMRect =>
      ({
        top,
        bottom,
        left: 0,
        right: 320,
        width: 320,
        height: bottom - top,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect

    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const isControl = this.hasAttribute('data-booking-focus')
      const isLine = this.parentElement?.hasAttribute('data-booking-transcript') === true
      if (isControl) return box(820, 880)
      if (isLine) return box(700, 760)
      return box(0, 0)
    })
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      () =>
        ({
          getPropertyValue: (name: string) => (name === '--softn-space-24' ? '6rem' : ''),
          fontSize: '16px',
        }) as CSSStyleDeclaration,
    )

    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    return { scrollTo, focus }
  }

  it('scrolls the window so the newest message and the step control both clear the sticky header', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    stubMotionPreference(false)
    const { scrollTo, focus } = stubLayout()
    renderFlow()

    await settle(2)
    fireEvent.click(screen.getByRole('button', { name: chatbot.consent.accept }))
    await settle(3)

    expect(screen.getByLabelText(chatbot.booking.steps.need.field)).toBeTruthy()
    expect(scrollTo).toHaveBeenCalled()
    const options = scrollTo.mock.calls.at(-1)?.[0] as ScrollToOptions
    // The block starts 96 px (the token) below the top: the newest line at 700 and the control at 880
    // both end up inside the 768 px viewport.
    expect(options.top).toBe(604)
    expect(options.behavior).toBe('smooth')
    // Focus never scrolls on its own: it would cancel the smooth scroll started above.
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('jumps without animation when motion is reduced', async () => {
    const { scrollTo } = stubLayout()
    renderFlow()

    fireEvent.click(await screen.findByRole('button', { name: chatbot.consent.accept }))
    await screen.findByLabelText(chatbot.booking.steps.need.field)

    const options = scrollTo.mock.calls.at(-1)?.[0] as ScrollToOptions
    expect(options.behavior).toBe('auto')
  })
})

describe('Booking flow steps', () => {
  it('asks consent, need, slot, then identity, and confirms in that order', async () => {
    renderFlow()

    fireEvent.click(await screen.findByRole('button', { name: chatbot.consent.accept }))
    await screen.findByLabelText(chatbot.booking.steps.need.field)
    expect(region().textContent).toContain(chatbot.booking.steps.need.question)
    expect(screen.getByText(chatbot.booking.step.replace('{current}', '1').replace('{total}', '8'))).toBeTruthy()

    typeIn(await screen.findByLabelText(chatbot.booking.steps.need.field), 'Automatiser mes devis')
    send()
    await waitFor(() => expect(slotChips().length).toBeGreaterThan(0))

    const slotLabel = slotChips()[0]?.textContent ?? ''
    fireEvent.click(slotChips()[0] as HTMLElement)
    await screen.findByLabelText(chatbot.booking.steps.firstName.field)

    expect(region().textContent).toContain(chatbot.booking.identityIntro)
    expect(region().textContent).toContain(chatbot.booking.steps.firstName.question)
    expect(region().textContent).toContain(slotLabel)

    typeIn(await screen.findByLabelText(chatbot.booking.steps.firstName.field), 'Marie')
    send()
    typeIn(await screen.findByLabelText(chatbot.booking.steps.lastName.field), 'Dupont')
    send()
    typeIn(await screen.findByLabelText(chatbot.booking.steps.email.field), 'marie@example.fr')
    send()
    fireEvent.click(await screen.findByRole('button', { name: chatbot.booking.steps.skip }))
    fireEvent.click(await screen.findByRole('button', { name: 'PME' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Marketing' }))

    expect(await screen.findByText(chatbot.booking.recap.title)).toBeTruthy()
    expect(screen.getAllByText('Marie').length).toBeGreaterThan(0)
    expect(screen.getAllByText('marie@example.fr').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: chatbot.booking.recap.confirm }))
    expect(await screen.findByText(chatbot.booking.success.title)).toBeTruthy()

    expect(callsTo(fetchMock, '/api/booking')[0]?.body).toEqual({
      consent: true,
      reference: '',
      need: 'Automatiser mes devis',
      slot: SLOTS[0]?.start,
      firstName: 'Marie',
      lastName: 'Dupont',
      email: 'marie@example.fr',
      structure: 'PME',
      role: 'Marketing',
    })
    // The client never declares when the consent was given: the server stamps it.
    expect(JSON.stringify(callsTo(fetchMock, '/api/booking'))).not.toContain('consentAt')
  })

  it('shows a few slots at a time and offers the others', async () => {
    renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: chatbot.consent.accept }))
    typeIn(await screen.findByLabelText(chatbot.booking.steps.need.field), 'Automatiser mes devis')
    send()

    await waitFor(() => expect(slotChips()).toHaveLength(4))
    expect(screen.getByRole('list', { name: chatbot.booking.slots.listLabel })).toBeTruthy()
    expect(screen.getByText(chatbot.booking.slots.timezoneNote)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: chatbot.booking.slots.more }))

    expect(slotChips()).toHaveLength(SLOTS.length)
    expect(screen.queryByRole('button', { name: chatbot.booking.slots.more })).toBeNull()
  })

  it('prefills the field when one answer is chosen from the recap edit link', async () => {
    renderFlow()
    await answerUpToRecap({ need: 'Automatiser mes devis' })

    fireEvent.click(screen.getByRole('button', { name: chatbot.booking.recap.edit }))
    expect(screen.getByText(plainSpaces(chatbot.booking.recap.editPrompt))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: chatbot.booking.steps.need.field }))

    expect((screen.getByLabelText(chatbot.booking.steps.need.field) as HTMLInputElement).value).toBe(
      'Automatiser mes devis',
    )
  })

  it('changes one answer and returns to the recap, keeping every other answer and asking nothing again', async () => {
    renderFlow()
    await answerUpToRecap({ need: 'Automatiser mes devis', phone: '06 12 34 56 78' })
    const linesBefore = transcript().length
    const slotLabel = slotChips()[0]?.textContent ?? ''

    fireEvent.click(screen.getByRole('button', { name: chatbot.booking.recap.edit }))
    // The consent is not an answer row, so it is not offered as something to change.
    expect(screen.queryByRole('button', { name: chatbot.consent.accept })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: chatbot.booking.steps.need.field }))
    typeIn(chatbot.booking.steps.need.field, 'Automatiser mes devis et mes factures')
    send()

    expect(await screen.findByText(chatbot.booking.recap.title)).toBeTruthy()
    expect(screen.queryByLabelText(chatbot.booking.steps.firstName.field)).toBeNull()
    expect(transcript().length, 'the edited answer adds no new question to the transcript').toBe(linesBefore)

    const recap = region().textContent ?? ''
    for (const answer of ['Marie', 'Dupont', 'marie@example.fr', '06 12 34 56 78', 'PME', 'Marketing', slotLabel]) {
      expect(recap, `the recap keeps "${answer}"`).toContain(answer)
    }
    expect(recap).toContain('Automatiser mes devis et mes factures')
  })

  it('changes the slot and keeps every other answer', async () => {
    renderFlow()
    await answerUpToRecap({ phone: '06 12 34 56 78' })

    fireEvent.click(screen.getByRole('button', { name: chatbot.booking.recap.edit }))
    fireEvent.click(screen.getByRole('button', { name: chatbot.booking.steps.slot.field }))
    await waitFor(() => expect(slotChips().length).toBeGreaterThan(1))
    const newSlot = slotChips()[1]?.textContent ?? ''
    fireEvent.click(slotChips()[1] as HTMLElement)

    expect(await screen.findByText(chatbot.booking.recap.title)).toBeTruthy()
    const recap = region().textContent ?? ''
    expect(recap).toContain(newSlot)
    for (const answer of ['Marie', 'Dupont', 'marie@example.fr', '06 12 34 56 78', 'PME', 'Marketing']) {
      expect(recap, `the recap keeps "${answer}"`).toContain(answer)
    }
    expect(screen.queryByLabelText(chatbot.booking.steps.firstName.field)).toBeNull()
  })

  it('reports a malformed e-mail and phone before sending anything', async () => {
    renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: chatbot.consent.accept }))
    typeIn(await screen.findByLabelText(chatbot.booking.steps.need.field), 'Automatiser mes devis')
    send()
    await waitFor(() => expect(slotChips().length).toBeGreaterThan(0))
    fireEvent.click(slotChips()[0] as HTMLElement)
    typeIn(await screen.findByLabelText(chatbot.booking.steps.firstName.field), 'Marie')
    send()
    typeIn(await screen.findByLabelText(chatbot.booking.steps.lastName.field), 'Dupont')
    send()

    typeIn(await screen.findByLabelText(chatbot.booking.steps.email.field), 'marie@example')
    send()

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toBe(chatbot.booking.steps.email.error)
    const email = screen.getByLabelText(chatbot.booking.steps.email.field)
    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(email.getAttribute('aria-describedby')).toBe(alert.id)
    expect(screen.queryByText(chatbot.booking.recap.title)).toBeNull()

    typeIn(screen.getByLabelText(chatbot.booking.steps.email.field), 'marie@example.fr')
    send()
    typeIn(await screen.findByLabelText(chatbot.booking.steps.phone.field), 'abc')
    send()

    expect(screen.getByRole('alert').textContent).toBe(chatbot.booking.steps.phone.error)
    expect(screen.queryByText(chatbot.booking.recap.title)).toBeNull()
  })

  it('moves focus to the control of each new step', async () => {
    renderFlow()

    const accept = await screen.findByRole('button', { name: chatbot.consent.accept })
    expect(document.activeElement).toBe(accept)

    fireEvent.click(accept)
    const needField = await screen.findByLabelText(chatbot.booking.steps.need.field)

    await waitFor(() => expect(document.activeElement).toBe(needField))
  })
})

describe('Booking flow failure and abandon states', () => {
  it('shows a retry when the availability cannot be read', async () => {
    let attempt = 0
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url === '/api/booking/slots') {
        attempt += 1
        if (attempt === 1) return jsonResponse({ error: 'unavailable' }, 503)
        return jsonResponse({ slots: SLOTS })
      }
      return jsonResponse({ booked: true })
    })
    renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: chatbot.consent.accept }))
    typeIn(await screen.findByLabelText(chatbot.booking.steps.need.field), 'Automatiser mes devis')
    send()

    await waitFor(() => expect(region().textContent).toContain(beforeContactLink(chatbot.booking.slots.unavailable)))

    fireEvent.click(screen.getByRole('button', { name: chatbot.error.retry }))

    await waitFor(() => expect(slotChips().length).toBeGreaterThan(0))
  })

  it('sends the visitor back to the slots when the slot was taken meanwhile', async () => {
    answerBooking(fetchMock, () => jsonResponse({ error: 'slot-taken' }, 409))
    renderFlow()
    await answerUpToRecap({})
    const loadsBefore = slotsCalls(fetchMock)

    fireEvent.click(screen.getByRole('button', { name: chatbot.booking.recap.confirm }))

    await waitFor(() => expect(slotsCalls(fetchMock)).toBeGreaterThan(loadsBefore))
    expect(slotChips().length).toBeGreaterThan(0)
    expect(screen.queryByText(chatbot.booking.success.title)).toBeNull()
  })

  it('keeps the booking error on the recap, with a retry that resends it', async () => {
    let attempt = 0
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url === '/api/booking/slots') return jsonResponse({ slots: SLOTS })
      if (url === '/api/booking') {
        attempt += 1
        return attempt === 1 ? jsonResponse({ error: 'unavailable' }, 503) : jsonResponse({ booked: true })
      }
      return jsonResponse({ answer: 'x' })
    })
    renderFlow()
    await answerUpToRecap({})

    fireEvent.click(screen.getByRole('button', { name: chatbot.booking.recap.confirm }))

    await waitFor(() => expect(region().textContent).toContain(beforeContactLink(chatbot.error.booking)))
    expect(callsTo(fetchMock, '/api/booking')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: chatbot.error.retry }))

    await waitFor(() => expect(callsTo(fetchMock, '/api/booking')).toHaveLength(2))
    expect(await screen.findByText(chatbot.booking.success.title)).toBeTruthy()
  })

  it('abandons the flow on the cancel button, and on Escape, without sending anything', async () => {
    renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: chatbot.consent.accept }))
    typeIn(await screen.findByLabelText(chatbot.booking.steps.need.field), 'Automatiser mes devis')

    fireEvent.click(screen.getByRole('button', { name: chatbot.booking.cancel }))
    expect(onCancel).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(region(), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(callsTo(fetchMock, '/api/booking')).toEqual([])
  })

  it('offers a skipped phone in the chooser, and adding it fills the recap and the request', async () => {
    renderFlow()
    await answerUpToRecap({ need: 'Automatiser mes devis' })

    fireEvent.click(screen.getByRole('button', { name: plainSpaces(chatbot.booking.recap.edit) }))

    // Every question is offered, skipped ones included: the recap table lists only answered fields,
    // so the phone left out had no row to reach it, and the chooser is the way back to it.
    const choices = [...region().querySelectorAll<HTMLElement>('[data-booking-edit]')].map((chip) => chip.textContent)
    expect(choices).toEqual([
      chatbot.booking.steps.need.field,
      chatbot.booking.steps.slot.field,
      chatbot.booking.steps.firstName.field,
      chatbot.booking.steps.lastName.field,
      chatbot.booking.steps.email.field,
      chatbot.booking.steps.phone.field,
      chatbot.booking.steps.structure.field,
      chatbot.booking.steps.role.field,
    ])

    fireEvent.click(screen.getByRole('button', { name: chatbot.booking.steps.phone.field }))
    const field = await screen.findByLabelText(chatbot.booking.steps.phone.field)

    // Reopened empty, with its usual way out: the answer can still be left out.
    expect((field as HTMLInputElement).value).toBe('')
    expect(screen.getByRole('button', { name: chatbot.booking.steps.skip })).toBeTruthy()

    typeIn(field, '0601020304')
    send()

    // Answered: the recap gains its row, and every other answer is still there.
    expect(await screen.findByText(chatbot.booking.recap.title)).toBeTruthy()
    expect(screen.getAllByText('0601020304').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Marie').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Automatiser mes devis').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: chatbot.booking.recap.confirm }))
    expect(await screen.findByText(chatbot.booking.success.title)).toBeTruthy()

    expect(callsTo(fetchMock, '/api/booking')[0]?.body).toMatchObject({
      consent: true,
      need: 'Automatiser mes devis',
      phone: '0601020304',
      firstName: 'Marie',
      lastName: 'Dupont',
      email: 'marie@example.fr',
      structure: 'PME',
      role: 'Marketing',
    })
  })

  it('removes an answered optional text answer when it is skipped while editing', async () => {
    renderFlow()
    await answerUpToRecap({ phone: '0601020304' })

    expect(screen.getAllByText('0601020304').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: plainSpaces(chatbot.booking.recap.edit) }))
    fireEvent.click(screen.getByRole('button', { name: chatbot.booking.steps.phone.field }))

    // The step comes back prefilled; skipping it there drops the answer instead of keeping the old one.
    const field = await screen.findByLabelText(chatbot.booking.steps.phone.field)
    expect((field as HTMLInputElement).value).toBe('0601020304')
    fireEvent.click(screen.getByRole('button', { name: chatbot.booking.steps.skip }))

    expect(await screen.findByText(chatbot.booking.recap.title)).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('0601020304')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: chatbot.booking.recap.confirm }))
    expect(await screen.findByText(chatbot.booking.success.title)).toBeTruthy()

    const body = callsTo(fetchMock, '/api/booking')[0]?.body as Record<string, unknown>
    expect(body).toMatchObject({
      need: 'Automatiser mes devis',
      firstName: 'Marie',
      lastName: 'Dupont',
      email: 'marie@example.fr',
      structure: 'PME',
      role: 'Marketing',
    })
    // A question left unanswered carries no key at all, not an empty value.
    expect('phone' in body).toBe(false)
  })

  it('removes an answered optional chip answer when it is skipped while editing', async () => {
    renderFlow()
    await answerUpToRecap({})

    expect(screen.getAllByText('PME').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: plainSpaces(chatbot.booking.recap.edit) }))
    fireEvent.click(screen.getByRole('button', { name: chatbot.booking.steps.structure.field }))
    fireEvent.click(await screen.findByRole('button', { name: chatbot.booking.steps.skip }))

    expect(await screen.findByText(chatbot.booking.recap.title)).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('PME')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: chatbot.booking.recap.confirm }))
    expect(await screen.findByText(chatbot.booking.success.title)).toBeTruthy()

    const body = callsTo(fetchMock, '/api/booking')[0]?.body as Record<string, unknown>
    expect('structure' in body).toBe(false)
    // The phone was skipped during the walk: no key for it either.
    expect(body).toMatchObject({ role: 'Marketing' })
    expect('phone' in body).toBe(false)
  })

  it('closes the chooser on Escape without leaving the flow, and puts focus back on the edit link', async () => {
    renderFlow()
    await answerUpToRecap({})

    const editLink = screen.getByRole('button', { name: plainSpaces(chatbot.booking.recap.edit) })

    fireEvent.click(editLink)
    expect(editLink.getAttribute('aria-expanded')).toBe('true')
    const chip = region().querySelector<HTMLElement>('[data-booking-edit]')
    expect(chip).not.toBeNull()

    // Escape on a choice closes the chooser only: the answers stay, the flow stays, focus comes back.
    fireEvent.keyDown(chip as HTMLElement, { key: 'Escape' })

    expect(editLink.getAttribute('aria-expanded')).toBe('false')
    expect(region().querySelector('[data-booking-edit]')).toBeNull()
    expect(document.activeElement).toBe(editLink)
    expect(onCancel).not.toHaveBeenCalled()

    // Same on the edit link itself, with the chooser open.
    fireEvent.click(editLink)
    fireEvent.keyDown(editLink, { key: 'Escape' })

    expect(editLink.getAttribute('aria-expanded')).toBe('false')
    expect(onCancel).not.toHaveBeenCalled()

    // With the chooser closed, Escape keeps its old meaning: it abandons the flow.
    fireEvent.keyDown(editLink, { key: 'Escape' })

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('refuses a nine-digit national number at the phone step, with the error and no advance', async () => {
    renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: chatbot.consent.accept }))
    typeIn(await screen.findByLabelText(chatbot.booking.steps.need.field), 'Automatiser mes devis')
    send()
    await waitFor(() => expect(slotChips().length).toBeGreaterThan(0))
    fireEvent.click(slotChips()[0] as HTMLElement)
    typeIn(await screen.findByLabelText(chatbot.booking.steps.firstName.field), 'Marie')
    send()
    typeIn(await screen.findByLabelText(chatbot.booking.steps.lastName.field), 'Dupont')
    send()
    typeIn(await screen.findByLabelText(chatbot.booking.steps.email.field), 'marie@example.fr')
    send()

    // Nine digits is a national number missing its leading zero: Mel reported it passing, and the
    // rule now refuses it exactly like the eight-digit case.
    for (const short of ['601020304', '06010203']) {
      const phone = await screen.findByLabelText(chatbot.booking.steps.phone.field)
      typeIn(phone, short)
      send()

      expect(screen.getByText(chatbot.booking.steps.phone.error)).toBeTruthy()
      expect(phone.getAttribute('aria-invalid')).toBe('true')
      // Nothing advanced: the structure question never entered the transcript.
      expect(region().textContent).not.toContain(chatbot.booking.steps.structure.question)
    }

    // A valid number leaves the step for the next question.
    typeIn(await screen.findByLabelText(chatbot.booking.steps.phone.field), '06 01 02 03 04')
    send()
    expect(await screen.findByRole('button', { name: 'PME' })).toBeTruthy()
  })

  it('refuses a short number in the recap edit flow, and holds the recap there', async () => {
    renderFlow()
    await answerUpToRecap({ phone: '0601020304' })
    fireEvent.click(screen.getByRole('button', { name: plainSpaces(chatbot.booking.recap.edit) }))
    fireEvent.click(region().querySelector<HTMLElement>('[data-booking-edit="phone"]') as HTMLElement)
    typeIn(await screen.findByLabelText(chatbot.booking.steps.phone.field), '601020304')
    send()

    expect(screen.getByText(chatbot.booking.steps.phone.error)).toBeTruthy()
    expect(screen.queryByText(chatbot.booking.recap.title)).toBeNull()

    // The answer was never committed: a valid one still returns to the recap with its new value.
    typeIn(await screen.findByLabelText(chatbot.booking.steps.phone.field), '06 01 02 03 04')
    send()
    expect(await screen.findByText(chatbot.booking.recap.title)).toBeTruthy()
    expect(screen.getAllByText('06 01 02 03 04').length).toBeGreaterThan(0)
  })

  it('reports an invalid phone on blur, without moving the flow, adding a line or moving focus', async () => {
    await walkToPhoneStep()
    const phone = await screen.findByLabelText(chatbot.booking.steps.phone.field)
    const linesBefore = transcript().length
    typeIn(phone, '601020304')

    fireEvent.blur(phone)

    expect(screen.getByText(chatbot.booking.steps.phone.error)).toBeTruthy()
    expect(phone.getAttribute('aria-invalid')).toBe('true')
    expect(phone.getAttribute('aria-describedby')).toBe('booking-phone-error')
    expect(screen.getByRole('alert').textContent).toBe(chatbot.booking.steps.phone.error)

    // Blur only reports: the step, the transcript and the focus all stay where they were.
    expect(screen.getByLabelText(chatbot.booking.steps.phone.field)).toBe(phone)
    expect(transcript().length).toBe(linesBefore)
    expect(region().textContent).not.toContain(chatbot.booking.steps.structure.question)
  })

  it('accepts an empty phone on blur, clears the error on correction, and stays quiet on a valid blur', async () => {
    await walkToPhoneStep()
    const phone = await screen.findByLabelText(chatbot.booking.steps.phone.field)

    // The question is optional: leaving it empty reports nothing.
    fireEvent.blur(phone)
    expect(screen.queryByText(chatbot.booking.steps.phone.error)).toBeNull()

    typeIn(phone, '06010203')
    fireEvent.blur(phone)
    expect(screen.getByText(chatbot.booking.steps.phone.error)).toBeTruthy()

    // Correcting the value clears the error through the field's own behaviour, and a later blur on
    // the valid value leaves nothing behind.
    typeIn(phone, '06 01 02 03 04')
    expect(screen.queryByText(chatbot.booking.steps.phone.error)).toBeNull()
    fireEvent.blur(phone)
    expect(screen.queryByText(chatbot.booking.steps.phone.error)).toBeNull()
  })

  it('shows one error, once, when send is pressed on a refused value, and does not advance', async () => {
    await walkToPhoneStep()
    const phone = await screen.findByLabelText(chatbot.booking.steps.phone.field)
    typeIn(phone, '06010203')

    // A real browser blurs the field before the click lands: the blur error and the submit error are
    // the same one, shown once.
    fireEvent.blur(phone)
    send()

    expect(screen.getAllByText(chatbot.booking.steps.phone.error)).toHaveLength(1)
    expect(region().textContent).not.toContain(chatbot.booking.steps.structure.question)
    expect(transcript().length).toBeGreaterThan(0)
  })

  it('still skips when the click lands after the blur error, and leaves no error behind', async () => {
    await walkToPhoneStep()
    const phone = await screen.findByLabelText(chatbot.booking.steps.phone.field)
    typeIn(phone, '06010203')
    fireEvent.blur(phone)
    expect(screen.getByText(chatbot.booking.steps.phone.error)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: plainSpaces(chatbot.booking.steps.skip) }))

    expect(await screen.findByRole('button', { name: 'PME' })).toBeTruthy()
    expect(screen.queryByText(chatbot.booking.steps.phone.error)).toBeNull()
  })

  it('reports an invalid phone on blur in the recap edit flow too, and its skip returns to the recap', async () => {
    renderFlow()
    await answerUpToRecap({ phone: '0601020304' })
    fireEvent.click(screen.getByRole('button', { name: plainSpaces(chatbot.booking.recap.edit) }))
    fireEvent.click(region().querySelector<HTMLElement>('[data-booking-edit="phone"]') as HTMLElement)
    const phone = await screen.findByLabelText(chatbot.booking.steps.phone.field)
    typeIn(phone, '601020304')

    fireEvent.blur(phone)

    expect(screen.getByText(chatbot.booking.steps.phone.error)).toBeTruthy()
    expect(screen.queryByText(chatbot.booking.recap.title)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: plainSpaces(chatbot.booking.steps.skip) }))

    expect(await screen.findByText(chatbot.booking.recap.title)).toBeTruthy()
    // Skipping while editing drops the answer, and nothing of the step's error survives it.
    expect(screen.queryByText(chatbot.booking.steps.phone.error)).toBeNull()
  })

  it('leaves the other fields alone: blurring the need reports nothing', async () => {
    renderFlow()
    fireEvent.click(await screen.findByRole('button', { name: chatbot.consent.accept }))
    const need = await screen.findByLabelText(chatbot.booking.steps.need.field)
    typeIn(need, '   Automatiser mes devis  ')

    fireEvent.blur(need)

    // The need, the first name and the last name keep validating on submit only: the phone and the
    // e-mail are the two fields that report on blur.
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('reports an invalid e-mail on blur, without moving the flow, adding a line or moving focus', async () => {
    await walkToEmailStep()
    const email = await screen.findByLabelText(chatbot.booking.steps.email.field)
    const linesBefore = transcript().length
    typeIn(email, 'a@b.c')

    fireEvent.blur(email)

    expect(screen.getByText(chatbot.booking.steps.email.error)).toBeTruthy()
    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(email.getAttribute('aria-describedby')).toBe('booking-email-error')
    expect(screen.getByRole('alert').textContent).toBe(chatbot.booking.steps.email.error)

    // Blur only reports: the step, the transcript and the focus all stay where they were.
    expect(screen.getByLabelText(chatbot.booking.steps.email.field)).toBe(email)
    expect(transcript().length).toBe(linesBefore)
    expect(region().textContent).not.toContain(chatbot.booking.steps.phone.question)
  })

  it('accepts an empty e-mail on blur, clears the error on correction, and stays quiet on a valid blur', async () => {
    await walkToEmailStep()
    const email = await screen.findByLabelText(chatbot.booking.steps.email.field)

    // Required, but that is the submit's business: merely passing through the field reports nothing.
    fireEvent.blur(email)
    expect(screen.queryByText(chatbot.booking.steps.email.error)).toBeNull()

    typeIn(email, 'a@b.c')
    fireEvent.blur(email)
    expect(screen.getByText(chatbot.booking.steps.email.error)).toBeTruthy()

    // A two-label domain passes: only the label after the final dot is measured.
    typeIn(email, 'a@b.co.uk')
    expect(screen.queryByText(chatbot.booking.steps.email.error)).toBeNull()
    fireEvent.blur(email)
    expect(screen.queryByText(chatbot.booking.steps.email.error)).toBeNull()
  })

  it('shows one e-mail error, once, when send is pressed on a refused address, and does not advance', async () => {
    await walkToEmailStep()
    const email = await screen.findByLabelText(chatbot.booking.steps.email.field)
    typeIn(email, 'a@b.c')

    fireEvent.blur(email)
    send()

    expect(screen.getAllByText(chatbot.booking.steps.email.error)).toHaveLength(1)
    expect(region().textContent).not.toContain(chatbot.booking.steps.phone.question)
  })

  it('still cancels when the cancel control is clicked after the e-mail blur error', async () => {
    await walkToEmailStep()
    const email = await screen.findByLabelText(chatbot.booking.steps.email.field)
    typeIn(email, 'a@b.c')
    fireEvent.blur(email)
    expect(screen.getByText(chatbot.booking.steps.email.error)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: chatbot.booking.cancel }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(callsTo(fetchMock, '/api/booking')).toEqual([])
  })

  it('reports an invalid e-mail on blur in the recap edit flow too', async () => {
    renderFlow()
    await answerUpToRecap({ email: 'marie@example.fr' })
    fireEvent.click(screen.getByRole('button', { name: plainSpaces(chatbot.booking.recap.edit) }))
    fireEvent.click(region().querySelector<HTMLElement>('[data-booking-edit="email"]') as HTMLElement)
    const email = await screen.findByLabelText(chatbot.booking.steps.email.field)
    typeIn(email, 'a@b.c')

    fireEvent.blur(email)

    expect(screen.getByText(chatbot.booking.steps.email.error)).toBeTruthy()
    expect(screen.queryByText(chatbot.booking.recap.title)).toBeNull()

    // A valid address returns to the recap, with the new value on its row.
    typeIn(email, 'marie@example.fr')
    send()
    expect(await screen.findByText(chatbot.booking.recap.title)).toBeTruthy()
    expect(screen.getAllByText('marie@example.fr').length).toBeGreaterThan(0)
  })

  it('puts the chooser between the table and the action row below md, and focuses its first choice', async () => {
    stubMotionPreference(true, true)
    const scrollIntoView = stubScrollIntoView()
    renderFlow()
    await answerUpToRecap({})

    const link = screen.getByRole('button', { name: plainSpaces(chatbot.booking.recap.edit) })
    fireEvent.click(link)

    const chooser = document.getElementById('booking-edit-chooser')
    const actions = screen.getByRole('button', { name: chatbot.booking.recap.confirm }).parentElement
    const table = screen.getByText(chatbot.booking.recap.title)

    // Reading order and visual order agree: table, chooser, then the link and the confirm button.
    expect(comesBefore(table, chooser)).toBe(true)
    expect(comesBefore(chooser, actions)).toBe(true)
    expect(link.getAttribute('aria-expanded')).toBe('true')
    expect(link.getAttribute('aria-controls')).toBe('booking-edit-chooser')

    // The first choice takes the focus, and is brought into view without moving the page itself.
    const firstChoice = region().querySelector<HTMLElement>('[data-booking-edit="need"]')
    expect(document.activeElement).toBe(firstChoice)
    // The test asks for reduced motion, so the reveal is instant instead of smooth.
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' })

    // Closing with the link leaves the flow alone and the chooser out of the DOM.
    fireEvent.click(link)
    expect(document.getElementById('booking-edit-chooser')).toBeNull()
    expect(link.getAttribute('aria-controls')).toBeNull()
    expect(screen.getByText(chatbot.booking.recap.title)).toBeTruthy()
  })

  it('keeps the chooser under the action row from md up, with the focus left on the link', async () => {
    const scrollIntoView = stubScrollIntoView()
    renderFlow()
    await answerUpToRecap({})

    const link = screen.getByRole('button', { name: plainSpaces(chatbot.booking.recap.edit) })
    fireEvent.click(link)

    const chooser = document.getElementById('booking-edit-chooser')
    const actions = screen.getByRole('button', { name: chatbot.booking.recap.confirm }).parentElement
    const table = screen.getByText(chatbot.booking.recap.title)

    expect(comesBefore(table, actions)).toBe(true)
    expect(comesBefore(actions, chooser)).toBe(true)
    // Nothing moved for the keyboard either: the focus is not taken from the link.
    expect(document.activeElement).not.toBe(region().querySelector('[data-booking-edit]'))
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('moves the open chooser to its new slot when the width crosses the breakpoint', async () => {
    const listeners: (() => void)[] = []
    let belowMd = false
    vi.stubGlobal('matchMedia', (query: string) => ({
      // Read through, not frozen: the change below must be visible to the same MediaQueryList the
      // component captured on mount. Reduced motion on, so the walk is not paced by timers.
      get matches() {
        return query.includes('min-width') ? !belowMd : true
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: () => void) => {
        if (query.includes('min-width')) listeners.push(listener)
      },
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }))
    stubScrollIntoView()
    renderFlow()
    await answerUpToRecap({})

    fireEvent.click(screen.getByRole('button', { name: plainSpaces(chatbot.booking.recap.edit) }))
    const chooser = document.getElementById('booking-edit-chooser')
    const actions = screen.getByRole('button', { name: chatbot.booking.recap.confirm }).parentElement
    expect(comesBefore(actions, chooser)).toBe(true)

    // The window narrows with the chooser open: the same chooser moves above the action row, and the
    // focus follows it to the first choice.
    act(() => {
      belowMd = true
      for (const listener of listeners) listener()
    })

    // The slot change re-creates the chooser in its new place: still one chooser, still one id.
    const moved = document.getElementById('booking-edit-chooser')
    expect(moved).not.toBeNull()
    expect(region().querySelectorAll('#booking-edit-chooser')).toHaveLength(1)
    expect(comesBefore(moved, actions)).toBe(true)
    expect(document.activeElement).toBe(region().querySelector('[data-booking-edit="need"]'))
  })

  it('returns the focus to the link on Escape below md, with every answer intact', async () => {
    stubMotionPreference(true, true)
    stubScrollIntoView()
    renderFlow()
    await answerUpToRecap({})

    const link = screen.getByRole('button', { name: plainSpaces(chatbot.booking.recap.edit) })
    fireEvent.click(link)
    fireEvent.keyDown(region().querySelector<HTMLElement>('[data-booking-edit="email"]') as HTMLElement, {
      key: 'Escape',
    })

    expect(document.activeElement).toBe(link)
    expect(document.getElementById('booking-edit-chooser')).toBeNull()
    expect(onCancel).not.toHaveBeenCalled()
    // Every answer is still on the recap.
    expect(screen.getAllByText('Marie').length).toBeGreaterThan(0)
    expect(screen.getAllByText('marie@example.fr').length).toBeGreaterThan(0)
    expect(screen.getAllByText('PME').length).toBeGreaterThan(0)
  })

  it('refuses the consent through its own action, with nothing sent', async () => {
    renderFlow()

    fireEvent.click(await screen.findByRole('button', { name: chatbot.consent.decline }))

    expect(onDecline).toHaveBeenCalledTimes(1)
    expect(callsTo(fetchMock, '/api/booking')).toEqual([])
    expect(callsTo(fetchMock, '/api/booking/slots')).toEqual([])
  })
})
