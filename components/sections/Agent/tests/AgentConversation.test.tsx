// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ASSISTANT_INTENT_EVENT, ASSISTANT_INTENTS } from '@/lib/assistant/intent'
import { interpolate } from '@/lib/interpolate'
import { ASSISTANT_QUESTION_MAX_LENGTH } from '@/schemas/assistantLimits'
import { agent } from '@/locales/fr/agent'
import { ASSISTANT_NAME, chatbot } from '@/locales/fr/chatbot'
import { contact } from '@/locales/fr/contact'
import { Agent } from '../Agent'

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
    expect(within(conversation).getByText(question)).toBeTruthy()
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

  it('runs the booking question when the site dispatches the booking intent', async () => {
    fetchMock.mockResolvedValue(answerResponse('Pour réserver…'))
    render(<Agent />)

    fireEvent(window, new CustomEvent(ASSISTANT_INTENT_EVENT, { detail: { intent: ASSISTANT_INTENTS.booking } }))

    await screen.findByText('Pour réserver…')
    const conversation = screen.getByRole('list', { name: filled(chatbot.panel.ariaLabel) })
    expect(within(conversation).getByText(chatbot.suggestions.book)).toBeTruthy()
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect(JSON.parse(String(init?.body))).toMatchObject({ question: chatbot.suggestions.book })
  })
})
