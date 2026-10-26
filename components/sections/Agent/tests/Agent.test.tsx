// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SECTION_IDS } from '@/lib/anchors'
import { agent } from '@/locales/fr/agent'
import { ASSISTANT_NAME, chatbot } from '@/locales/fr/chatbot'
import { Agent } from '../Agent'
import { groupMessagesBySpeaker } from '../data/agentMessages'

/** A rendered text with its `{assistantName}` placeholders filled, as the section renders it. */
const filled = (template: string): string => template.replaceAll('{assistantName}', ASSISTANT_NAME)

afterEach(cleanup)

describe('Agent', () => {
  it('is the assistant section, named by its single h2 filled with the assistant name', () => {
    const { container } = render(<Agent />)
    const section = container.querySelector('section')
    expect(section?.getAttribute('id')).toBe(SECTION_IDS.agent)
    expect(section?.getAttribute('id')).toBe('assistant')

    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading.textContent).toBe(filled(agent.title))
    expect(section?.getAttribute('aria-labelledby')).toBe(heading.getAttribute('id'))
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1)
  })

  it('renders the eyebrow with the assistant name and a decorative status dot', () => {
    render(<Agent />)
    const eyebrow = screen.getByText(filled(agent.eyebrow))
    const dot = eyebrow.querySelector('span[aria-hidden="true"]')
    expect(dot).not.toBeNull()
    expect(dot?.textContent).toBe('')
  })

  it('groups the two welcome messages under one speaker label, in order', () => {
    const { container } = render(<Agent />)
    const list = container.querySelector('ol')
    expect(list).not.toBeNull()
    if (list === null) return

    const groups = list.querySelectorAll(':scope > li')
    expect(groups).toHaveLength(1)
    expect(groups[0]?.querySelector('p')?.textContent).toBe(filled(agent.speaker.assistant))

    const texts = [chatbot.welcome.first, chatbot.welcome.prompt].map(filled)
    const messages = groups[0] === undefined ? [] : [...groups[0].querySelectorAll('li')]
    expect(messages.map((message) => message.textContent)).toEqual(texts)
  })

  it('shows the assistant speaker label once and keeps every message attributable to it', () => {
    render(<Agent />)
    expect(screen.getAllByText(filled(agent.speaker.assistant))).toHaveLength(1)

    const group = screen.getByRole('list', { name: filled(agent.speaker.assistant) })
    const messages = within(group).getAllByRole('listitem')
    expect(messages.map((message) => message.textContent)).toEqual(
      [chatbot.welcome.first, chatbot.welcome.prompt].map(filled),
    )
  })

  it('shows the typing indicator with the locale accessible label and decorative dots', () => {
    render(<Agent />)
    const typing = screen.getByRole('img', { name: filled(chatbot.typing.ariaLabel) })
    const dots = typing.querySelectorAll('span[aria-hidden="true"]')
    expect(dots).toHaveLength(3)
    for (const dot of dots) expect(dot.textContent).toBe('')
  })

  it('renders every suggested question as a focusable button that never submits', () => {
    render(<Agent />)
    const chips = screen.getByRole('list', { name: chatbot.suggestionsLabel })
    expect(chips.tagName).toBe('UL')

    const buttons = within(chips).getAllByRole('button')
    const suggestions = Object.values(chatbot.suggestions)
    expect(buttons).toHaveLength(suggestions.length)
    buttons.forEach((button, index) => {
      expect(button.getAttribute('type')).toBe('button')
      expect(button.textContent).toBe(suggestions[index])
      expect(button.tabIndex).toBe(0)
    })
  })

  it('marks the booking chip by identity and styles it apart from the question chips', () => {
    render(<Agent />)
    const chips = screen.getByRole('list', { name: chatbot.suggestionsLabel })
    const buttons = within(chips).getAllByRole('button')

    const booking = buttons.filter((button) => button.dataset.suggestion === 'book')
    expect(booking, 'exactly one chip is identified as the booking chip').toHaveLength(1)
    expect(booking[0]?.textContent).toBe(chatbot.suggestions.book)

    const question = screen.getByRole('button', { name: chatbot.suggestions.process })
    expect(question.dataset.suggestion).toBe('process')
    expect(booking[0]?.className, 'the booking chip adds an emphasis class to the shared chip class').not.toBe(
      question.className,
    )
  })

  it('labels the question input and keeps the send button out of the submit path', () => {
    render(<Agent />)
    const input = screen.getByLabelText(agent.inputLabel)
    expect(input.tagName).toBe('INPUT')
    expect(input.getAttribute('placeholder')).toBe(agent.inputPlaceholder)
    expect(input.getAttribute('type')).toBe('text')

    const send = screen.getByRole('button', { name: agent.sendLabel })
    expect(send.getAttribute('type')).toBe('button')
    expect(screen.queryByRole('form')).toBeNull()
  })

  it('renders the scope note under the composer and links it to the input as its description', () => {
    render(<Agent />)
    const input = screen.getByLabelText(agent.inputLabel)
    const noteId = input.getAttribute('aria-describedby')
    expect(noteId, 'the input is described by the scope note').toBeTruthy()

    const note = noteId === null ? null : document.getElementById(noteId)
    expect(note?.tagName).toBe('P')
    expect(note?.textContent).toBe(filled(agent.scopeNote))
    if (note === null) return
    expect(input.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('holds no copy of its own: every rendered text comes from the locales', () => {
    const { container } = render(<Agent />)
    const allowed = [
      agent.eyebrow,
      agent.title,
      agent.speaker.assistant,
      agent.inputLabel,
      agent.scopeNote,
      chatbot.welcome.first,
      chatbot.welcome.prompt,
      ...Object.values(chatbot.suggestions),
    ].map(filled)

    const texts: string[] = []
    const walk = (node: Node): void => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = (node.textContent ?? '').trim()
        if (text !== '') texts.push(text)
        return
      }
      node.childNodes.forEach(walk)
    }
    walk(container)

    expect(texts.length).toBeGreaterThan(0)
    for (const text of texts) expect(allowed, `unexpected copy: "${text}"`).toContain(text)
  })
})

describe('groupMessagesBySpeaker', () => {
  it('keeps a speaker run together and opens a group when the speaker changes', () => {
    const groups = groupMessagesBySpeaker([
      { speaker: 'assistant', template: 'a' },
      { speaker: 'assistant', template: 'b' },
      { speaker: 'visitor', template: 'c' },
      { speaker: 'assistant', template: 'd' },
    ])

    expect(groups).toEqual([
      { speaker: 'assistant', templates: ['a', 'b'] },
      { speaker: 'visitor', templates: ['c'] },
      { speaker: 'assistant', templates: ['d'] },
    ])
  })

  it('returns no group for an empty conversation', () => {
    expect(groupMessagesBySpeaker([])).toEqual([])
  })
})
