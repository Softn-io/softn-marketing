import {
  chromium,
  devices,
  webkit,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
} from '@playwright/test'

/**
 * Scaffolding shared by the specs that drive a real mobile engine: the engine × device matrix,
 * the CSP `upgrade-insecure-requests` strip WebKit needs over the plain-HTTP test server, the
 * launch of a browser with device emulation, and real CDP touch input.
 */

/** The engines every mobile-engine suite runs: Chromium for Android Chrome, WebKit for iOS Safari. */
export const MOBILE_ENGINES = [
  { name: 'chromium · Pixel 7', engine: chromium, device: devices['Pixel 7'] },
  { name: 'webkit · iPhone 13', engine: webkit, device: devices['iPhone 13'] },
] as const

export type MobileEngine = (typeof MOBILE_ENGINES)[number]
export type MobileEngineType = MobileEngine['engine']
export type MobileEngineDevice = MobileEngine['device']

/**
 * Removes the CSP `upgrade-insecure-requests` directive from response headers. Over the plain-HTTP
 * test server WebKit would rewrite every localhost asset to HTTPS and none would load; production
 * serves over HTTPS where the directive is inert, and the mobile-engine specs assert nothing about
 * CSP. Chromium exempts localhost, so its headers stay untouched.
 */
export const stripUpgradeInsecureRequests = (headers: Record<string, string>): Record<string, string> => {
  const csp = headers['content-security-policy']
  if (csp === undefined) return headers
  return {
    ...headers,
    'content-security-policy': csp.replace('upgrade-insecure-requests', '').replace(/;\s*;/g, ';').replace(/;\s*$/, ''),
  }
}

/**
 * Launches an engine with real device emulation. The caller adds its own routing needs on the
 * returned context: the CSP strip on WebKit (`stripUpgradeInsecureRequestsOnContext`), or a
 * bespoke request route.
 */
export const launchMobileEngine = async (
  engine: MobileEngineType,
  device: MobileEngineDevice,
): Promise<{ browser: Browser; context: BrowserContext }> => {
  const browser = await engine.launch()
  const context = await browser.newContext({ ...device })
  return { browser, context }
}

/**
 * Rewrites every response of a context to drop the CSP `upgrade-insecure-requests` directive.
 * Only WebKit needs it; no route is registered on the other engines.
 */
export const stripUpgradeInsecureRequestsOnContext = async (
  context: BrowserContext,
  engine: MobileEngineType,
): Promise<void> => {
  if (engine !== webkit) return
  await context.route('**/*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, headers: stripUpgradeInsecureRequests(response.headers()) })
  })
}

/**
 * Drives one real touch gesture through the CDP input pipeline (Chromium only — WebKit does not
 * expose CDP touch): a touchStart at `(x, y)`, one touchMove per clientY with a pause after each,
 * and a touchEnd after the settle delay, as a visitor's finger would travel.
 */
export const dispatchTouchPath = async (
  page: Page,
  session: CDPSession,
  gesture: { x: number; y: number; clientYs: number[]; moveDelayMs: number; settleMs: number },
): Promise<void> => {
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', clientY: number) =>
    session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x: gesture.x, y: clientY }],
    })
  await touch('touchStart', gesture.y)
  for (const clientY of gesture.clientYs) {
    await touch('touchMove', clientY)
    await page.waitForTimeout(gesture.moveDelayMs)
  }
  await page.waitForTimeout(gesture.settleMs)
  await touch('touchEnd', gesture.y)
}
