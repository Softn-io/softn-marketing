// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { ringlessFinalFocus } from './ringlessFinalFocus'

/**
 * `ringlessFinalFocus` builds Base UI's `finalFocus` handler. Base UI calls it with the
 * `InteractionType` of the close — `''` while the popup is still open, `'keyboard'` for a
 * keyboard close, `'mouse'` / `'touch'` / `'pen'` for a pointer close — and focuses the returned
 * element itself afterwards.
 */
describe('ringlessFinalFocus', () => {
  const makeTarget = () => {
    const element = document.createElement('button')
    const target = createRef<HTMLElement | null>()
    target.current = element
    return { element, target }
  }

  it('returns the target element', () => {
    const { element, target } = makeTarget()
    const handleFinalFocus = ringlessFinalFocus(target)
    expect(handleFinalFocus('mouse')).toBe(element)
  })

  it.each(['mouse', 'touch', 'pen'] as const)(
    'focuses the target without a ring and without scrolling on a %s close',
    (closeType) => {
      const { element, target } = makeTarget()
      const focus = vi.spyOn(element, 'focus')
      const handleFinalFocus = ringlessFinalFocus(target)
      expect(handleFinalFocus(closeType)).toBe(element)
      expect(focus).toHaveBeenCalledTimes(1)
      expect(focus).toHaveBeenCalledWith({ preventScroll: true, focusVisible: false })
    },
  )

  it('does not focus on a keyboard close, so the browser keeps the visible ring', () => {
    const { element, target } = makeTarget()
    const focus = vi.spyOn(element, 'focus')
    const handleFinalFocus = ringlessFinalFocus(target)
    expect(handleFinalFocus('keyboard')).toBe(element)
    expect(focus).not.toHaveBeenCalled()
  })

  it('does not focus while the popup is still open (empty close type)', () => {
    const { element, target } = makeTarget()
    const focus = vi.spyOn(element, 'focus')
    const handleFinalFocus = ringlessFinalFocus(target)
    expect(handleFinalFocus('')).toBe(element)
    expect(focus).not.toHaveBeenCalled()
  })

  it('returns null when the target is not mounted, without focusing anything', () => {
    const target = createRef<HTMLElement | null>()
    const handleFinalFocus = ringlessFinalFocus(target)
    expect(handleFinalFocus('touch')).toBeNull()
  })
})
