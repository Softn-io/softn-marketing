import type { Page } from '@playwright/test'
import { UMAMI_ORIGIN } from '../../lib/analytics/umamiRoutes'

/** One intercepted analytics request: `direct` is true when it targeted the real Umami origin. */
export type UmamiHit = { url: string; direct: boolean }

export type StubUmamiOptions = {
  /** Called for every intercepted request, as it happens. */
  readonly onHit?: (hit: UmamiHit) => void
  /**
   * Body served for the tracker script instead of the inert comment: a test double that exposes
   * `window.umami.getSession` (the internal the loader wraps) and a `__umamiTestSend(url)` helper
   * which runs the page's real `before-send` hook and posts to `/m/api/send` only when the hook
   * keeps the payload. Used by the withdrawal specs that must exercise the hook against the live
   * consent store. Everything but `/m/tr.js` always stays inert.
   */
  readonly trackerBody?: string
}

const INERT_BODY = '/* Playwright stub: the real Umami scripts are never fetched in tests */'

/**
 * Stubs the Umami endpoints for one page (issue #24). Installed before any navigation, it fulfils
 * every `/m/*` proxy request and every request to the real Umami origin, so a suite that grants
 * the audience consent — banner accept, stored record — never loads the real tracker, never
 * records a replay and never sends a pageview to the production dashboard. It returns the list of
 * intercepted hits, so a spec can assert on what was (or was never) requested.
 *
 * Never `route.fetch` an `/m/*` request instead: `next start` rewrites it to the Umami origin, so
 * the fetch would leave the machine and hit the real instance.
 */
export const stubUmami = async (page: Page, options: StubUmamiOptions = {}): Promise<UmamiHit[]> => {
  const hits: UmamiHit[] = []
  const record = (url: string, direct: boolean): void => {
    const hit = { url, direct }
    hits.push(hit)
    options.onHit?.(hit)
  }
  const fulfil = (body: string) => ({ status: 200, contentType: 'application/javascript', body })

  await page.route('**/m/**', (route) => {
    const url = route.request().url()
    record(url, false)
    return route.fulfill(fulfil(url.endsWith('/m/tr.js') ? (options.trackerBody ?? INERT_BODY) : INERT_BODY))
  })
  await page.route(`**${UMAMI_ORIGIN}/**`, (route) => {
    record(route.request().url(), true)
    return route.fulfill(fulfil(INERT_BODY))
  })
  return hits
}
