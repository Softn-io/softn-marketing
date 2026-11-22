'use client'

/*
 * Anti-bot widget of the contact form: the Altcha proof of work, self-hosted.
 *
 * The widget is a custom element of the `altcha` package, loaded with the form island through
 * `next/dynamic` so its chunk stays out of the initial page load. It fetches its challenge from this
 * site's own route, solves it in Web Workers in the browser, and writes the solved payload into a
 * hidden input associated with our form: the payload travels with the message, and no third party is
 * called. Its wording, its colours and its radii come from the validated copy and from `--softn-*`
 * tokens; nothing about it is written here.
 *
 * The control it draws is its switch, not its checkbox: the widget renders it as a native checkbox
 * input with a switch look, so a screen reader announces a checkbox with its checked state, and the
 * space bar toggles it like any other checkbox.
 *
 * The library ships its own French strings, which are not the sentences Mel validated: the effect
 * below replaces them in the widget's own i18n store at mount. The widget reads that store
 * reactively, and `auto` is off, so no verification — and no state wording of its own — can appear
 * before the validated copy is in place.
 */

import { useEffect, useRef } from 'react'
import 'altcha'
import 'altcha/i18n/fr-fr'
// Type-only: it declares the `altcha-widget` JSX element and the widget's global. Importing it at
// runtime would pull the package's own `./global` shim into the bundle, which nothing needs.
import type {} from 'altcha/types/react'
import type { AltchaWidgetElement } from 'altcha/types/generic'
import { contact } from '@/locales/fr/contact'
import { CONTACT_FIELDS } from '@/schemas/contactLimits'
import type { CSSProperties } from 'react'
import type { CSSVariables } from 'altcha/types'
import styles from './styles/ContactAltcha.module.css'

/** Challenge route of this site, the only address the widget ever calls. */
const CONTACT_CHALLENGE_PATH = '/api/contact/challenge'

/** States the widget reports, as the form shows and announces them. */
export type ContactAltchaState = 'unverified' | 'verifying' | 'verified' | 'error' | 'expired'

/** Widget state names this page knows; anything else counts as unverified. */
const CONTACT_ALTCHA_STATES: Readonly<Record<string, ContactAltchaState>> = {
  unverified: 'unverified',
  verifying: 'verifying',
  verified: 'verified',
  error: 'error',
  expired: 'expired',
}

/**
 * Wording the widget shows, from the validated copy.
 *
 * The states are the short labels the widget renders; the fuller sentences a screen reader reads are
 * announced by the form itself, from `contact.a11y.altcha`.
 */
const CONTACT_ALTCHA_STRINGS: Readonly<Record<string, string>> = {
  label: contact.form.altcha.label,
  verifying: contact.form.altcha.states.verifying,
  verified: contact.form.altcha.states.verified,
  error: contact.form.altcha.states.error,
  expired: contact.form.altcha.states.expired,
}

/**
 * Configuration of the widget: its footer and its logo are hidden, so the group shows only the copy
 * Mel validated and carries no link to a third-party site at all.
 */
const CONTACT_ALTCHA_CONFIGURATION = JSON.stringify({ hideFooter: true, hideLogo: true })

/**
 * Theme of the widget, as the custom properties it reads.
 *
 * A custom element renders its own styles, so Softn tokens reach it as CSS variables: every colour,
 * radius and length below is a `--softn-*` token, and no raw value is written here. The control the
 * widget draws is its switch: its size follows the control size of the form, its off state takes the
 * input tokens, and its on state takes the brand violet through the "success" pair the widget paints
 * its checked control with — the same violet as the checked consent box.
 */
const CONTACT_ALTCHA_STYLE = {
  '--altcha-color-base': 'var(--softn-background-surface)',
  '--altcha-color-base-content': 'var(--softn-color)',
  '--altcha-color-neutral': 'var(--softn-border-default)',
  '--altcha-color-neutral-content': 'var(--softn-color-secondary)',
  '--altcha-color-primary': 'var(--softn-brand-vivid)',
  '--altcha-color-primary-content': 'var(--softn-brand-foreground)',
  '--altcha-color-error': 'var(--softn-error)',
  '--altcha-color-error-content': 'var(--softn-color-inverse)',
  '--altcha-color-success': 'var(--softn-brand-vivid)',
  '--altcha-color-success-content': 'var(--softn-brand-foreground)',
  '--altcha-border-color': 'var(--softn-border-subtle)',
  '--altcha-border-radius': 'var(--softn-radius-xl)',
  // The switch: its own pair, because the widget resolves the defaults of these on `:root` and a
  // value set on the element would not reach them. The track takes the control height of the form
  // and a wider track, the padding and the thumb follow, and the off state takes the input tokens.
  '--altcha-switch-height': 'var(--softn-icon-size-md)',
  '--altcha-switch-width': 'var(--softn-space-10)',
  '--altcha-switch-padding': 'var(--softn-space-1)',
  '--altcha-switch-toggle-size': 'calc(var(--softn-icon-size-md) - var(--softn-space-1) * 2)',
  '--altcha-switch-background-color': 'var(--softn-input-background)',
  '--altcha-switch-border-radius': 'var(--softn-radius-pill)',
  '--altcha-switch-toggle-color': 'var(--softn-input-border-strong)',
  '--altcha-switch-toggle-border-radius': 'var(--softn-radius-pill)',
  // The focus ring of the widget's own controls: the code-challenge input and buttons of its
  // popovers, which take this pair from the widget's `:focus` rules. The switch does not use it —
  // the stylesheet draws its ring on keyboard focus only.
  '--altcha-checkbox-outline': '2px solid var(--softn-input-border-focus)',
  '--altcha-checkbox-outline-offset': '2px',
  '--altcha-input-background-color': 'var(--softn-input-background)',
  '--altcha-max-width': '100%',
  '--altcha-padding': 'var(--softn-space-4)',
  '--altcha-shadow': 'none',
  '--altcha-transition-duration': 'var(--softn-duration-micro)',
} satisfies CSSProperties & Partial<CSSVariables>

/**
 * Reads the state of one widget event.
 *
 * The widget dispatches a `statechange` event whose detail carries the state name; anything else —
 * another event, a missing detail, a state this build does not know — counts as unverified.
 *
 * @param event Event dispatched by the widget.
 * @returns The state the form shows.
 */
const contactAltchaStateOf = (event: Event): ContactAltchaState => {
  if (!(event instanceof CustomEvent)) return 'unverified'

  const detail: unknown = event.detail
  if (typeof detail !== 'object' || detail === null || !('state' in detail)) return 'unverified'
  if (typeof detail.state !== 'string') return 'unverified'

  return CONTACT_ALTCHA_STATES[detail.state] ?? 'unverified'
}

/** Props of {@link ContactAltcha}. */
type ContactAltchaProps = {
  /** Id of the form the widget's hidden payload input belongs to. */
  readonly formId: string
  /** Called on every state change, so the form can show and announce the current one. */
  readonly onStateChange: (state: ContactAltchaState) => void
  /**
   * Counter the form increments to ask for a fresh check, after a submission the server refused: the
   * payload of a refused submission is spent, and the widget must solve a new challenge.
   */
  readonly resetToken: number
}

/**
 * Renders the Altcha widget of the contact form.
 *
 * @param props Form id, state callback and reset counter.
 * @returns The custom element the library upgrades.
 */
export const ContactAltcha = ({ formId, onStateChange, resetToken }: ContactAltchaProps) => {
  const widgetRef = useRef<AltchaWidgetElement | null>(null)

  // The library's French strings are registered by the import above; ours replace the sentences the
  // copy owns, before any verification can start.
  useEffect(() => {
    const i18n = globalThis.$altcha.i18n
    i18n.set('fr-fr', { ...i18n.get('fr-fr'), ...CONTACT_ALTCHA_STRINGS })
  }, [])

  useEffect(() => {
    const widget = widgetRef.current
    if (widget === null) return

    const handleStateChange = (event: Event): void => {
      onStateChange(contactAltchaStateOf(event))
    }
    widget.addEventListener('statechange', handleStateChange)

    return () => widget.removeEventListener('statechange', handleStateChange)
  }, [onStateChange])

  useEffect(() => {
    if (resetToken === 0) return
    widgetRef.current?.reset()
  }, [resetToken])

  return (
    <altcha-widget
      ref={widgetRef}
      className={styles.widget}
      challenge={CONTACT_CHALLENGE_PATH}
      name={CONTACT_FIELDS.altcha}
      type="switch"
      auto="off"
      form={formId}
      configuration={CONTACT_ALTCHA_CONFIGURATION}
      style={CONTACT_ALTCHA_STYLE}
    />
  )
}
