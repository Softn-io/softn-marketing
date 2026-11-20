// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CookieSettingsButton } from '@components/layout/Footer/CookieSettingsButton'
import { CONSENT_SCHEMA_VERSION, CONSENT_STORAGE_KEY } from '@/lib/consent'
import { getPreferencesPanelRequestOpener, resetPreferencesPanelRequest } from '@/lib/consent/preferencesPanelRequest'
import { cookieBanner } from '@/locales/fr/legal'
import { footer } from '@/locales/fr/footer'
import { CookieConsent } from '../CookieConsent'
import { getFinalFocus } from '../CookiePreferencesDialog'

const readStored = (): string | null => localStorage.getItem(CONSENT_STORAGE_KEY)

const readStoredAudience = (): unknown => {
  const raw = readStored()
  if (raw === null) return undefined
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null) return undefined
  return Reflect.get(parsed, 'audience')
}

const storeChoice = (audience: boolean): void => {
  localStorage.setItem(
    CONSENT_STORAGE_KEY,
    JSON.stringify({ version: CONSENT_SCHEMA_VERSION, audience, decidedAt: new Date().toISOString() }),
  )
}

const openFromBanner = (): HTMLElement => {
  const trigger = screen.getByRole('button', { name: cookieBanner.customize })
  trigger.focus()
  fireEvent.click(trigger)
  return trigger
}

const openFromFooter = (): HTMLElement => {
  const trigger = screen.getByRole('button', { name: footer.cookieSettings })
  // A real click focuses the button; the dialog's native return focus targets that same element.
  trigger.focus()
  fireEvent.click(trigger)
  return trigger
}

beforeEach(() => {
  localStorage.clear()
  resetPreferencesPanelRequest()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CookieConsent', () => {
  it('renders the banner without a stored choice', () => {
    render(<CookieConsent />)

    expect(screen.getByRole('region', { name: cookieBanner.ariaLabel })).toBeTruthy()
    expect(screen.getByRole('heading', { name: cookieBanner.title })).toBeTruthy()
    expect(screen.getByText(cookieBanner.body.replaceAll('\n', ' '))).toBeTruthy()
    expect(screen.getByRole('link', { name: cookieBanner.learnMore })).toBeTruthy()
  })

  it('hides the banner when a valid choice is stored', () => {
    storeChoice(false)

    render(<CookieConsent />)

    expect(screen.queryByRole('region', { name: cookieBanner.ariaLabel })).toBeNull()
  })

  it('stores the acceptance and closes the banner', async () => {
    render(<CookieConsent />)

    fireEvent.click(screen.getByRole('button', { name: cookieBanner.accept }))

    await waitFor(() => expect(screen.queryByRole('region', { name: cookieBanner.ariaLabel })).toBeNull())
    expect(readStoredAudience()).toBe(true)
    expect(screen.getByRole('status').textContent).toContain(cookieBanner.saved)
  })

  it('stores the refusal and closes the banner', async () => {
    render(<CookieConsent />)

    fireEvent.click(screen.getByRole('button', { name: cookieBanner.decline }))

    await waitFor(() => expect(screen.queryByRole('region', { name: cookieBanner.ariaLabel })).toBeNull())
    expect(readStoredAudience()).toBe(false)
    expect(screen.getByRole('status').textContent).toContain(cookieBanner.saved)
  })

  it('opens the preferences dialog from the banner', async () => {
    render(<CookieConsent />)

    openFromBanner()

    expect(await screen.findByRole('dialog', { name: cookieBanner.preferences.title })).toBeTruthy()
  })

  it('shows the audience switch off by default', async () => {
    render(<CookieConsent />)

    openFromBanner()

    const dialog = await screen.findByRole('dialog', { name: cookieBanner.preferences.title })
    const audienceSwitch = screen.getByRole('switch', { name: cookieBanner.preferences.audience.toggleAriaLabel })
    expect(dialog.contains(audienceSwitch)).toBe(true)
    expect(audienceSwitch.getAttribute('aria-checked')).toBe('false')
  })

  it('reflects a stored audience choice when the dialog opens', async () => {
    storeChoice(true)
    render(
      <>
        <CookieConsent />
        <CookieSettingsButton />
      </>,
    )

    openFromFooter()

    const dialog = await screen.findByRole('dialog', { name: cookieBanner.preferences.title })
    const audienceSwitch = screen.getByRole('switch', { name: cookieBanner.preferences.audience.toggleAriaLabel })
    expect(dialog.contains(audienceSwitch)).toBe(true)
    expect(audienceSwitch.getAttribute('aria-checked')).toBe('true')
  })

  it('saves the audience choice from the dialog and closes both surfaces', async () => {
    render(<CookieConsent />)

    openFromBanner()

    const dialog = await screen.findByRole('dialog', { name: cookieBanner.preferences.title })
    const audienceSwitch = screen.getByRole('switch', { name: cookieBanner.preferences.audience.toggleAriaLabel })
    fireEvent.click(audienceSwitch)
    fireEvent.click(screen.getByRole('button', { name: cookieBanner.preferences.save }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: cookieBanner.preferences.title })).toBeNull())
    expect(readStoredAudience()).toBe(true)
    expect(screen.queryByRole('region', { name: cookieBanner.ariaLabel })).toBeNull()
    expect(screen.getByRole('status').textContent).toContain(cookieBanner.saved)
    expect(dialog.isConnected).toBe(false)
  })

  it('leaves the banner in place when Escape closes the dialog without saving', async () => {
    render(<CookieConsent />)

    openFromBanner()

    const dialog = await screen.findByRole('dialog', { name: cookieBanner.preferences.title })
    fireEvent.keyDown(dialog, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog', { name: cookieBanner.preferences.title })).toBeNull())
    expect(screen.getByRole('region', { name: cookieBanner.ariaLabel })).toBeTruthy()
    expect(readStored()).toBeNull()
  })

  it('leaves the banner in place when the close button closes the dialog without saving', async () => {
    render(<CookieConsent />)

    openFromBanner()

    await screen.findByRole('dialog', { name: cookieBanner.preferences.title })
    fireEvent.click(screen.getByRole('button', { name: cookieBanner.preferences.closeAriaLabel }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: cookieBanner.preferences.title })).toBeNull())
    expect(screen.getByRole('region', { name: cookieBanner.ariaLabel })).toBeTruthy()
    expect(readStored()).toBeNull()
  })

  it('returns focus to the footer control when the dialog closes', async () => {
    render(
      <>
        <CookieConsent />
        <CookieSettingsButton />
      </>,
    )

    const trigger = openFromFooter()
    const dialog = await screen.findByRole('dialog', { name: cookieBanner.preferences.title })
    fireEvent.keyDown(dialog, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog', { name: cookieBanner.preferences.title })).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('returns focus to the banner control when the dialog closes without saving', async () => {
    render(<CookieConsent />)

    const trigger = openFromBanner()
    const dialog = await screen.findByRole('dialog', { name: cookieBanner.preferences.title })
    fireEvent.keyDown(dialog, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog', { name: cookieBanner.preferences.title })).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('returns focus to the opener even when it was not focused before opening', async () => {
    render(
      <>
        <CookieConsent />
        <CookieSettingsButton />
      </>,
    )

    const trigger = screen.getByRole('button', { name: footer.cookieSettings })
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: cookieBanner.preferences.title })
    fireEvent.keyDown(dialog, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog', { name: cookieBanner.preferences.title })).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('clears the recorded opener when the dialog closes', async () => {
    render(<CookieConsent />)

    openFromBanner()
    const dialog = await screen.findByRole('dialog', { name: cookieBanner.preferences.title })
    fireEvent.keyDown(dialog, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog', { name: cookieBanner.preferences.title })).toBeNull())
    await waitFor(() => expect(getPreferencesPanelRequestOpener()).toBeNull())
  })

  it('keeps the opener after an empty close type while open, then returns focus on the real close', async () => {
    render(<CookieConsent />)

    const trigger = openFromBanner()
    const dialog = await screen.findByRole('dialog', { name: cookieBanner.preferences.title })

    expect(getFinalFocus('')).toBe(trigger)
    expect(getPreferencesPanelRequestOpener()).toBe(trigger)

    fireEvent.keyDown(dialog, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog', { name: cookieBanner.preferences.title })).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('opens the dialog when the footer control was clicked before the layer mounted', async () => {
    render(<CookieSettingsButton />)

    const trigger = screen.getByRole('button', { name: footer.cookieSettings })
    trigger.focus()
    fireEvent.click(trigger)

    render(<CookieConsent />)

    expect(await screen.findByRole('dialog', { name: cookieBanner.preferences.title })).toBeTruthy()
  })

  it('moves focus into the main landmark when saving removes the banner trigger', async () => {
    render(
      <>
        <main>
          <button type="button">Retour à l&apos;accueil</button>
        </main>
        <CookieConsent />
      </>,
    )

    openFromBanner()

    await screen.findByRole('dialog', { name: cookieBanner.preferences.title })
    fireEvent.click(screen.getByRole('button', { name: cookieBanner.preferences.save }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: cookieBanner.preferences.title })).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /Retour à l/ })))
  })

  it('stays silent when the storage refuses the saved choice', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    render(<CookieConsent />)

    fireEvent.click(screen.getByRole('button', { name: cookieBanner.accept }))

    await waitFor(() => expect(screen.queryByRole('region', { name: cookieBanner.ariaLabel })).toBeNull())
    expect(screen.getByRole('status').textContent).toBe('')
  })
})
