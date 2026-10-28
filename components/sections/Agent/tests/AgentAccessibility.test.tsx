// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { agent } from '@/locales/fr/agent'
import { ASSISTANT_NAME, chatbot } from '@/locales/fr/chatbot'
import { Agent } from '../Agent'

/*
 * Accessibility contract of the section that unit tests can carry: the section is a region named
 * by its heading, only the real controls take focus, and every decorative element is hidden from
 * assistive technology. Focus outlines, contrast and heading order need a real browser and live
 * in `e2e/agentSection.spec.ts`.
 */

const filled = (template: string): string => template.replaceAll('{assistantName}', ASSISTANT_NAME)

afterEach(cleanup)

describe('Agent accessibility', () => {
  it('is a region named by its single h2', () => {
    const { container } = render(<Agent />)
    const region = screen.getByRole('region', { name: filled(agent.title) })
    expect(region).toBe(container.querySelector('section'))
  })

  it('takes focus only on the real controls: input, send button and chips', () => {
    render(<Agent />)
    const input = screen.getByLabelText(agent.inputLabel)
    input.focus()
    expect(document.activeElement).toBe(input)

    fireEvent.change(input, { target: { value: 'Une question' } })
    const send = screen.getByRole('button', { name: agent.sendLabel })
    send.focus()
    expect(document.activeElement).toBe(send)

    const chip = screen.getByRole('button', { name: chatbot.suggestions.process })
    chip.focus()
    expect(document.activeElement).toBe(chip)
  })

  it('keeps every decorative element out of the accessibility tree and the tab order', () => {
    const { container } = render(<Agent />)
    const hidden = container.querySelectorAll('[aria-hidden="true"]')
    expect(hidden.length).toBeGreaterThanOrEqual(3) // glow, status dot, send icon
    for (const element of hidden) {
      expect(element.matches('span, div, svg'), 'decorations are spans, divs or icons, not controls').toBe(true)
      expect(element.getAttribute('tabindex'), 'no decoration is focusable').toBeNull()
    }
  })

  it('names the message list and each speaker run', () => {
    render(<Agent />)
    const conversation = screen.getByRole('list', { name: filled(chatbot.panel.ariaLabel) })
    const speakerRun = within(conversation).getByRole('list', { name: filled(agent.speaker.assistant) })
    expect(within(speakerRun).getAllByRole('listitem')).toHaveLength(2)
  })

  it('carries no heading below the section h2', () => {
    const { container } = render(<Agent />)
    expect(container.querySelectorAll('h3, h4, h5, h6')).toHaveLength(0)
    expect(container.querySelectorAll('h2')).toHaveLength(1)
  })
})
