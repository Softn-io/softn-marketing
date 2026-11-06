import { describe, expect, it } from 'vitest'
import { isPlainLeftClick, type PlainLeftClickEvent } from './pointer'

/** Builds a primary click with no modifier held, unless the overrides say otherwise. */
const clickEvent = (overrides: Partial<PlainLeftClickEvent> = {}): PlainLeftClickEvent => ({
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...overrides,
})

describe('isPlainLeftClick', () => {
  it('accepts the primary button with no modifier', () => {
    expect(isPlainLeftClick(clickEvent())).toBe(true)
  })

  it('rejects the middle and secondary buttons', () => {
    expect(isPlainLeftClick(clickEvent({ button: 1 }))).toBe(false)
    expect(isPlainLeftClick(clickEvent({ button: 2 }))).toBe(false)
  })

  it('rejects a click holding any single modifier', () => {
    expect(isPlainLeftClick(clickEvent({ metaKey: true }))).toBe(false)
    expect(isPlainLeftClick(clickEvent({ ctrlKey: true }))).toBe(false)
    expect(isPlainLeftClick(clickEvent({ shiftKey: true }))).toBe(false)
    expect(isPlainLeftClick(clickEvent({ altKey: true }))).toBe(false)
  })

  it('rejects a click holding several modifiers at once', () => {
    expect(isPlainLeftClick(clickEvent({ metaKey: true, ctrlKey: true, shiftKey: true, altKey: true }))).toBe(false)
  })
})
