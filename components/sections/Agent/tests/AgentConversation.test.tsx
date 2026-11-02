// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ASSISTANT_INTENT_EVENT, ASSISTANT_INTENTS } from '@/lib/assistant/intent'
import { interpolate } from '@/lib/interpolate'
import { ASSISTANT_QUESTION_MAX_LENGTH } from '@/schemas/assistantLimits'
import { agent } from '@/locales/fr/agent'
import { ASSISTANT_NAME, chatbot } from '@/locales/fr/chatbot'
import { contact } from '@/locales/fr/contact'
import { Agent } from '../Agent'
import {
  answerBooking,
  beforeContactLink,
  callsTo,
  plainSpaces,
  plainSpacesContaining,
  stubMotionPreference,
} from './bookingTestUtils'

const filled = (template: string): string => template.replaceAll('{assistantName}', ASSISTANT_NAME)

const answerResponse = (answer: string): Response =>
  new Response(JSON.stringify({ answer }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

const errorResponse = (error: string, status: number): Response =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/** A promise the test resolves after it has checked the waiting state. */
const deferredResponse = (): { promise: Promise<Response>; resolve: (response: Response) => void } => {
  let resolve: (response: Response) => void = () => undefined
  const promise = new Promise<Response>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Agent conversation', () => {
  it('asks the chip question, shows the waiting state and renders the answer', async () => {
    const waiting = deferredResponse()
    fetchMock.mockReturnValue(waiting.promise)
    render(<Agent />)

    fireEvent.click(screen.getByRole('button', { name: chatbot.suggestions.process }))

    const question = chatbot.suggestions.process
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect(JSON.parse(String(init?.body))).toEqual({ question, history: [] })

    expect(screen.getByText(filled(chatbot.thinking.message))).toBeTruthy()
    expect(screen.getByRole('img', { name: filled(chatbot.typing.ariaLabel) })).toBeTruthy()
    for (const button of screen.getAllByRole('button')) {
      if (button.textContent === chatbot.suggestions.process || button.textContent === chatbot.suggestions.book) {
        expect((button as HTMLButtonElement).disabled, 'chips are disabled while an answer is in flight').toBe(true)
      }
    }

    waiting.resolve(answerResponse('Une réponse ancrée.'))

    await screen.findByText('Une réponse ancrée.')
    const conversation = screen.getByRole('list', { name: filled(chatbot.panel.ariaLabel) })
    expect(within(conversation).getByText(plainSpaces(question))).toBeTruthy()
    expect(screen.queryByRole('img', { name: filled(chatbot.typing.ariaLabel) })).toBeNull()
    expect((screen.getByRole('button', { name: chatbot.suggestions.process }) as HTMLButtonElement).disabled).toBe(
      false,
    )
  })

  it('submits the composer value trimmed and keeps it as the visitor message', async () => {
    fetchMock.mockResolvedValue(answerResponse('Réponse.'))
    render(<Agent />)

    const input = screen.getByLabelText(agent.inputLabel)
    fireEvent.change(input, { target: { value: '  Comment se passe un projet ?  ' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)

    await screen.findByText('Réponse.')
    const conversation = screen.getByRole('list', { name: filled(chatbot.panel.ariaLabel) })
    expect(within(conversation).getByText('Comment se passe un projet ?')).toBeTruthy()
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect(JSON.parse(String(init?.body))).toMatchObject({ question: 'Comment se passe un projet ?' })
    expect((input as HTMLInputElement).value).toBe('')
  })

  it('sends the previous turns as bounded history, without the welcome copy', async () => {
    fetchMock
      .mockResolvedValueOnce(answerResponse('Première réponse.'))
      .mockResolvedValueOnce(answerResponse('Seconde réponse.'))
    render(<Agent />)

    const input = screen.getByLabelText(agent.inputLabel)
    fireEvent.change(input, { target: { value: 'Première question' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)
    await screen.findByText('Première réponse.')

    fireEvent.change(input, { target: { value: 'Seconde question' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)
    await screen.findByText('Seconde réponse.')

    const [, init] = fetchMock.mock.calls[1] ?? []
    expect(JSON.parse(String(init?.body))).toEqual({
      question: 'Seconde question',
      history: [
        { role: 'user', content: 'Première question' },
        { role: 'assistant', content: 'Première réponse.' },
      ],
    })
  })

  it('keeps the failed question and retries it without adding a second visitor message', async () => {
    fetchMock
      .mockResolvedValueOnce(errorResponse('unavailable', 503))
      .mockResolvedValueOnce(answerResponse('Réponse après reprise.'))
    render(<Agent />)

    const input = screen.getByLabelText(agent.inputLabel)
    fireEvent.change(input, { target: { value: 'Une question' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(chatbot.error.llm.replace('{contactPageLink}', chatbot.contactPageLinkLabel))
    expect(alert.textContent, 'the link label replaces the words in place, with no trailing label').not.toContain(
      `${chatbot.contactPageLinkLabel} :`,
    )
    expect(within(alert).getByRole('link', { name: chatbot.contactPageLinkLabel }).getAttribute('href')).toBe(
      contact.link.href,
    )

    fireEvent.click(screen.getByRole('button', { name: chatbot.error.llmRetry }))
    await screen.findByText('Réponse après reprise.')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.getAllByText('Une question')).toHaveLength(1)
    const [, init] = fetchMock.mock.calls[1] ?? []
    expect(JSON.parse(String(init?.body))).toEqual({ question: 'Une question', history: [] })
  })

  it('maps our rate limit to its own copy', async () => {
    fetchMock.mockResolvedValue(errorResponse('rate-limited', 429))
    render(<Agent />)

    const input = screen.getByLabelText(agent.inputLabel)
    fireEvent.change(input, { target: { value: 'Une question' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(chatbot.error.rateLimit)
  })

  it('maps a network failure to the connection copy', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    render(<Agent />)

    const input = screen.getByLabelText(agent.inputLabel)
    fireEvent.change(input, { target: { value: 'Une question' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(chatbot.error.network)
  })

  it('maps a malformed success payload to the generic unavailable copy', async () => {
    // A 200 whose body is not the expected `{ answer }`: broken JSON or a schema mismatch both end
    // on the same generic error, never on a partial answer.
    fetchMock.mockResolvedValue(
      new Response('{"answer":', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    render(<Agent />)

    const input = screen.getByLabelText(agent.inputLabel)
    fireEvent.change(input, { target: { value: 'Une question' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(chatbot.error.llm.replace('{contactPageLink}', chatbot.contactPageLinkLabel))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('renders the validated fallback with a real contact-page link, never the placeholder', async () => {
    fetchMock.mockResolvedValue(answerResponse(chatbot.fallback))
    render(<Agent />)

    fireEvent.click(screen.getByRole('button', { name: chatbot.suggestions.process }))
    const link = await screen.findByRole('link', { name: chatbot.contactPageLinkLabel })

    expect(link.getAttribute('href')).toBe(contact.link.href)
    expect(link.closest('li')?.textContent, 'the link label replaces the words in place').toBe(
      chatbot.fallback.replace('{contactPageLink}', chatbot.contactPageLinkLabel),
    )
    expect(screen.queryByText('{contactPageLink}', { exact: false })).toBeNull()
  })

  it('blocks a too-long question, marks the field invalid and explains why', () => {
    render(<Agent />)

    const input = screen.getByLabelText(agent.inputLabel)
    fireEvent.change(input, { target: { value: 'a'.repeat(ASSISTANT_QUESTION_MAX_LENGTH + 1) } })

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toBe(interpolate(chatbot.input.tooLong, { max: String(ASSISTANT_QUESTION_MAX_LENGTH) }))
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toContain(alert.id)
    expect((screen.getByRole('button', { name: agent.sendLabel }) as HTMLButtonElement).disabled).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('opens the reservation flow when the site dispatches the booking intent', async () => {
    stubMotionPreference(true)
    fetchMock.mockResolvedValue(answerResponse('Pour réserver…'))
    render(<Agent />)

    fireEvent(window, new CustomEvent(ASSISTANT_INTENT_EVENT, { detail: { intent: ASSISTANT_INTENTS.booking } }))

    // The booking intent opens the reservation flow: the model is never asked a booking question.
    await screen.findByRole('region', { name: chatbot.suggestions.book })
    expect(await screen.findByText(chatbot.booking.intro)).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

/**
 * Lets the flow's zero-delay reveals run: the reduced-motion preference stubbed below schedules each
 * message as an immediate timer, so one turn of the event loop is all it takes.
 */
const settleFlow = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('Agent conversation with the booking flow', () => {
  /*
   * These tests ride through the agent section, where the flow arrives as a lazy chunk: they stub the
   * reduced-motion preference so the flow reveals its messages without pacing, and assert what the
   * visitor sees around it. The flow's own rhythm is tested in `BookingFlow.test.tsx`.
   */

  beforeEach(() => {
    stubMotionPreference(true)
    answerBooking(fetchMock)
  })

  it('opens the reservation flow from the booking chip, without asking the model', async () => {
    render(<Agent />)

    fireEvent.click(screen.getByRole('button', { name: chatbot.suggestions.book }))
    await settleFlow()

    const region = await screen.findByRole('region', { name: chatbot.suggestions.book })
    expect(within(region).getByText(chatbot.booking.intro)).toBeTruthy()
    expect(callsTo(fetchMock, '/api/assistant')).toEqual([])
    expect(callsTo(fetchMock, '/api/booking')).toEqual([])
  })

  it('returns to the conversation when the consent is refused, with nothing sent', async () => {
    render(<Agent />)
    fireEvent.click(screen.getByRole('button', { name: chatbot.suggestions.book }))
    await screen.findByRole('region', { name: chatbot.suggestions.book })

    fireEvent.click(await screen.findByRole('button', { name: chatbot.consent.decline }))

    expect(screen.queryByRole('region', { name: chatbot.suggestions.book })).toBeNull()
    expect(await screen.findByText(plainSpacesContaining(beforeContactLink(chatbot.consent.declined)))).toBeTruthy()
    expect(callsTo(fetchMock, '/api/booking')).toEqual([])
    expect(callsTo(fetchMock, '/api/booking/slots')).toEqual([])
  })

  it('returns to the conversation when the flow is abandoned, with nothing sent', async () => {
    render(<Agent />)
    fireEvent.click(screen.getByRole('button', { name: chatbot.suggestions.book }))
    await screen.findByRole('region', { name: chatbot.suggestions.book })

    fireEvent.click(await screen.findByRole('button', { name: chatbot.booking.cancel }))

    expect(screen.queryByRole('region', { name: chatbot.suggestions.book })).toBeNull()
    expect(await screen.findByText(chatbot.booking.cancelled)).toBeTruthy()
    expect(callsTo(fetchMock, '/api/booking')).toEqual([])
  })

  it('never lets a booking answer reach the model, including after the flow', async () => {
    render(<Agent />)
    fireEvent.click(screen.getByRole('button', { name: chatbot.suggestions.book }))
    await screen.findByRole('region', { name: chatbot.suggestions.book })

    fireEvent.click(await screen.findByRole('button', { name: chatbot.consent.accept }))
    fireEvent.change(await screen.findByLabelText(chatbot.booking.steps.need.field), {
      target: { value: 'Automatiser mes devis' },
    })
    fireEvent.click(screen.getByRole('button', { name: agent.sendLabel }))
    await waitFor(() => expect(document.querySelectorAll('[data-booking-slot]').length).toBeGreaterThan(0))
    fireEvent.click(document.querySelectorAll('[data-booking-slot]')[0] as HTMLElement)
    fireEvent.change(await screen.findByLabelText(chatbot.booking.steps.firstName.field), {
      target: { value: 'Marie' },
    })
    fireEvent.click(screen.getByRole('button', { name: agent.sendLabel }))
    fireEvent.change(await screen.findByLabelText(chatbot.booking.steps.lastName.field), {
      target: { value: 'Dupont' },
    })
    fireEvent.click(screen.getByRole('button', { name: agent.sendLabel }))
    fireEvent.change(await screen.findByLabelText(chatbot.booking.steps.email.field), {
      target: { value: 'marie@example.fr' },
    })
    fireEvent.click(screen.getByRole('button', { name: agent.sendLabel }))
    fireEvent.click(await screen.findByRole('button', { name: chatbot.booking.steps.skip }))
    fireEvent.click(await screen.findByRole('button', { name: 'PME' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Marketing' }))
    fireEvent.click(await screen.findByRole('button', { name: chatbot.booking.recap.confirm }))
    await screen.findByText(chatbot.booking.success.title)

    fireEvent.click(screen.getByRole('button', { name: chatbot.booking.success.restart }))
    const input = await screen.findByLabelText(agent.inputLabel)
    fetchMock.mockResolvedValue(answerResponse('Une réponse du modèle.'))
    fireEvent.change(input, { target: { value: 'Comment se passe un projet ?' } })
    fireEvent.click(screen.getByRole('button', { name: agent.sendLabel }))

    await waitFor(() => expect(callsTo(fetchMock, '/api/assistant')).toHaveLength(1))

    const sent = JSON.stringify(callsTo(fetchMock, '/api/assistant'))
    for (const answer of ['Automatiser mes devis', 'Marie', 'Dupont', 'marie@example.fr']) {
      expect(sent).not.toContain(answer)
    }
    expect(callsTo(fetchMock, '/api/assistant')[0]?.body).toEqual({
      question: 'Comment se passe un projet ?',
      history: [],
    })
  })

  it('keeps the booking transcript out of the assistant messages', async () => {
    render(<Agent />)
    fireEvent.click(screen.getByRole('button', { name: chatbot.suggestions.book }))
    await screen.findByRole('region', { name: chatbot.suggestions.book })
    fireEvent.click(await screen.findByRole('button', { name: chatbot.consent.accept }))
    await settleFlow()
    fireEvent.change(await screen.findByLabelText(chatbot.booking.steps.need.field), {
      target: { value: 'Automatiser mes devis' },
    })
    fireEvent.click(screen.getByRole('button', { name: agent.sendLabel }))

    await waitFor(() => expect(document.querySelectorAll('[data-booking-slot]').length).toBeGreaterThan(0))

    const conversation = screen.getByRole('list', { name: filled(chatbot.panel.ariaLabel) })
    expect(within(conversation).queryByText('Automatiser mes devis')).toBeNull()

    const region = screen.getByRole('region', { name: chatbot.suggestions.book })
    expect(within(region).getAllByText('Automatiser mes devis').length).toBeGreaterThan(0)
  })
})
