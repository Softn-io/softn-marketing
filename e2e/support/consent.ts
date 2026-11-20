import type { Page } from '@playwright/test'

/**
 * Consent scaffolding shared by the specs that are not about the consent banner itself
 * (issue #23). The fixed banner sits on top of the page until the visitor answers, so a suite
 * that exercises the page behind it seeds a valid stored choice first; a suite that audits the
 * page *with* the banner waits for the banner's entrance animation to settle before axe reads
 * the painted colours.
 */

/** Key of the single localStorage entry that holds the consent choice (issue #23 contract). */
export const CONSENT_STORAGE_KEY = 'softn-consent'

/**
 * Seeds a valid stored consent record (a refusal by default) before any page script runs: the
 * banner never mounts, so the page behind it is exercised exactly as a returning visitor sees it.
 * Pass the page (or context) before navigation; the record is dated now, so it stays valid.
 */
export const seedStoredConsent = (page: Page, audience: boolean = false): void => {
  page.addInitScript(
    ({ key, audience: choice }) =>
      localStorage.setItem(key, JSON.stringify({ version: 1, audience: choice, decidedAt: new Date().toISOString() })),
    { key: CONSENT_STORAGE_KEY, audience },
  )
}

/**
 * Waits until the consent layer has mounted and, when the banner is shown, until its entrance
 * animation has finished. Axe composites a text painted mid-fade against the surface and reports
 * a transient color-contrast violation no user ever reads; this is the settle barrier the banner
 * adds to that guidance (same rule as `awaitRevealSettled` in `accessibility.spec.ts`). Resolves
 * immediately when no banner appears (a stored choice or a page without the layer). Scoped to the
 * banner's own animations: the page runs infinite ones (the hero glow) that never finish.
 */
export const awaitConsentUiSettled = async (page: Page): Promise<void> => {
  const banner = page.locator('section[aria-label="Choix des cookies"]')
  const appeared = await banner
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false)
  if (!appeared) return
  await banner.evaluate((card) =>
    Promise.all(card.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
  )
}
