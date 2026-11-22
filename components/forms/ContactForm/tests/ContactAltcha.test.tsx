// @vitest-environment jsdom
/*
 * Wiring of the Altcha widget: the attributes that make it solve this site's challenge, the wording
 * it takes from the validated copy, the state it reports back and the reset the form asks for after a
 * refused submission. The library itself is mocked: its chunk, its workers and its own rendering are
 * not what this file covers, and the custom element is replaced by a stub that exposes `reset`.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { contact } from '@/locales/fr/contact'
import { ContactAltcha } from '../ContactAltcha'

vi.mock('altcha', () => ({}))
vi.mock('altcha/i18n/fr-fr', () => ({}))

const i18nMock = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }))

/** Stub of the library's custom element: the payload input and the rendering are not under test. */
class FakeAltchaWidget extends HTMLElement {
  reset = vi.fn()
}

/** Installs the widget's own global, as the library creates it when its chunk loads. */
const installAltchaGlobal = (): void => {
  i18nMock.get.mockReturnValue({ label: 'Je ne suis pas un robot', verified: 'Vérifié' })
  Object.defineProperty(globalThis, '$altcha', {
    value: { i18n: i18nMock },
    configurable: true,
  })
}

beforeEach(() => {
  if (customElements.get('altcha-widget') === undefined) customElements.define('altcha-widget', FakeAltchaWidget)
  i18nMock.get.mockReset()
  i18nMock.set.mockReset()
  installAltchaGlobal()
})

afterEach(() => {
  cleanup()
})

const renderWidget = (resetToken = 0) => {
  const onStateChange = vi.fn()
  const { container, rerender } = render(
    <ContactAltcha formId="contact-form-1" onStateChange={onStateChange} resetToken={resetToken} />,
  )
  const widget = container.querySelector('altcha-widget')
  if (widget === null) throw new Error('the widget should render')

  return { widget, onStateChange, rerender }
}

describe('ContactAltcha', () => {
  it('solves this site own challenge, as a switch the visitor turns on', () => {
    const { widget } = renderWidget()

    expect(widget.getAttribute('challenge')).toBe('/api/contact/challenge')
    expect(widget.getAttribute('name')).toBe('altcha')
    expect(widget.getAttribute('type')).toBe('switch')
    expect(widget.getAttribute('auto')).toBe('off')
    expect(widget.getAttribute('form')).toBe('contact-form-1')
    // The widget links nowhere: its footer and its logo are both hidden.
    expect(JSON.parse(widget.getAttribute('configuration') ?? '{}')).toEqual({ hideFooter: true, hideLogo: true })
  })

  it('themes the widget with Softn tokens only', () => {
    const { widget } = renderWidget()

    const tokenVariables = [
      '--altcha-color-base',
      '--altcha-color-base-content',
      '--altcha-color-neutral',
      '--altcha-color-neutral-content',
      '--altcha-color-primary',
      '--altcha-color-primary-content',
      '--altcha-color-error',
      '--altcha-color-success',
      '--altcha-color-success-content',
      '--altcha-border-color',
      '--altcha-border-radius',
      '--altcha-switch-height',
      '--altcha-switch-width',
      '--altcha-switch-padding',
      '--altcha-switch-toggle-size',
      '--altcha-switch-background-color',
      '--altcha-switch-border-radius',
      '--altcha-switch-toggle-color',
      '--altcha-switch-toggle-border-radius',
      '--altcha-checkbox-outline',
      '--altcha-input-background-color',
      '--altcha-padding',
      '--altcha-transition-duration',
    ] as const

    for (const name of tokenVariables) {
      expect(widget.style.getPropertyValue(name)).toContain('var(--softn-')
    }
    expect(widget.style.getPropertyValue('--altcha-color-base')).toBe('var(--softn-background-surface)')
    expect(widget.style.getPropertyValue('--altcha-border-radius')).toBe('var(--softn-radius-xl)')
    // The switch: the control size and the input tokens of its off state, the brand violet of the
    // checked consent box for its on state, and the focus ring pair the widget's own focusable
    // controls take. The switch's ring is drawn by the stylesheet, on keyboard focus only.
    expect(widget.style.getPropertyValue('--altcha-switch-height')).toBe('var(--softn-icon-size-md)')
    expect(widget.style.getPropertyValue('--altcha-switch-toggle-size')).toBe(
      'calc(var(--softn-icon-size-md) - var(--softn-space-1) * 2)',
    )
    expect(widget.style.getPropertyValue('--altcha-switch-background-color')).toBe('var(--softn-input-background)')
    expect(widget.style.getPropertyValue('--altcha-switch-border-radius')).toBe('var(--softn-radius-pill)')
    expect(widget.style.getPropertyValue('--altcha-switch-toggle-border-radius')).toBe('var(--softn-radius-pill)')
    expect(widget.style.getPropertyValue('--altcha-color-success')).toBe('var(--softn-brand-vivid)')
    expect(widget.style.getPropertyValue('--altcha-color-success-content')).toBe('var(--softn-brand-foreground)')
    expect(widget.style.getPropertyValue('--altcha-checkbox-outline')).toBe('2px solid var(--softn-input-border-focus)')
  })

  it('replaces the library strings with the validated copy', () => {
    renderWidget()

    expect(i18nMock.set).toHaveBeenCalledWith(
      'fr-fr',
      expect.objectContaining({
        label: contact.form.altcha.label,
        verifying: contact.form.altcha.states.verifying,
        verified: contact.form.altcha.states.verified,
        error: contact.form.altcha.states.error,
        expired: contact.form.altcha.states.expired,
      }),
    )
  })

  it('reports every state the form announces, and counts an unknown one as unverified', () => {
    const { widget, onStateChange } = renderWidget()

    for (const state of ['verifying', 'verified', 'error', 'expired', 'unverified'] as const) {
      widget.dispatchEvent(new CustomEvent('statechange', { detail: { state } }))
      expect(onStateChange).toHaveBeenLastCalledWith(state)
    }

    widget.dispatchEvent(new CustomEvent('statechange', { detail: { state: 'code' } }))
    expect(onStateChange).toHaveBeenLastCalledWith('unverified')

    widget.dispatchEvent(new Event('load'))
    expect(onStateChange).toHaveBeenLastCalledWith('unverified')
  })

  it('resets the widget when the form asks for a fresh check', () => {
    const { widget, rerender } = renderWidget(0)
    if (!(widget instanceof FakeAltchaWidget)) throw new Error('the widget stub should be upgraded')
    expect(widget.reset).not.toHaveBeenCalled()

    rerender(<ContactAltcha formId="contact-form-1" onStateChange={vi.fn()} resetToken={1} />)

    expect(widget.reset).toHaveBeenCalledTimes(1)
  })
})
