// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { BOOKING_MANAGE_PATH } from '@/lib/booking/manageToken'
import { CONSENT_SCHEMA_VERSION, CONSENT_STORAGE_KEY } from '@/lib/consent'
import {
  createUmamiInjector,
  isUmamiExcludedPath,
  UMAMI_WEBSITE_ID,
  type UmamiConsentReader,
  type UmamiEnvironment,
} from './umami'
import {
  UMAMI_API_PREFIX,
  UMAMI_HOST_URL,
  UMAMI_ORIGIN,
  UMAMI_RECORDER_SRC,
  UMAMI_REWRITES,
  UMAMI_TRACKER_SRC,
} from './umamiRoutes'

const PAGE_ORIGIN = 'https://softn.io'

const environmentOf = (
  pathname: string,
  options: { readonly origin?: string; readonly readConsent?: UmamiConsentReader } = {},
): UmamiEnvironment => ({
  document,
  location: { pathname },
  origin: options.origin ?? PAGE_ORIGIN,
  readConsent: options.readConsent ?? (() => ({ audience: true })),
  window,
})

const scriptOf = (src: string): HTMLScriptElement | null =>
  document.head.querySelector<HTMLScriptElement>(`script[src="${src}"]`)

const clearBrowser = (): void => {
  document.head.innerHTML = ''
  delete window.__umamiBeforeSend
  delete window.umami
  localStorage.clear()
  window.history.replaceState(null, '', '/')
}

const storeConsent = (audience: boolean): void => {
  localStorage.setItem(
    CONSENT_STORAGE_KEY,
    JSON.stringify({ version: CONSENT_SCHEMA_VERSION, audience, decidedAt: new Date().toISOString() }),
  )
}

describe('isUmamiExcludedPath', () => {
  it('excludes the booking manage page, its token and its children', () => {
    expect(isUmamiExcludedPath('/rendez-vous')).toBe(true)
    expect(isUmamiExcludedPath('/rendez-vous/secret-token')).toBe(true)
    expect(isUmamiExcludedPath('/rendez-vous/secret-token/edit')).toBe(true)
  })

  it('excludes the path the booking module actually serves the manage page from', () => {
    // Pins the mirrored constant to BOOKING_MANAGE_PATH: a rename in that module fails here
    // instead of silently starting to track the token page.
    expect(isUmamiExcludedPath(BOOKING_MANAGE_PATH)).toBe(true)
    expect(isUmamiExcludedPath(`${BOOKING_MANAGE_PATH}/secret-token`)).toBe(true)
  })

  it('excludes the gated preview page', () => {
    expect(isUmamiExcludedPath('/preview')).toBe(true)
  })

  it('keeps every other path', () => {
    expect(isUmamiExcludedPath('/')).toBe(false)
    expect(isUmamiExcludedPath('/contact')).toBe(false)
    expect(isUmamiExcludedPath('/politique-de-cookies')).toBe(false)
    expect(isUmamiExcludedPath('/rendez-vous-preview')).toBe(false)
  })
})

describe('umamiRoutes', () => {
  it('serves every injected path through a rewrite of the Umami origin', () => {
    const bySource = new Map(UMAMI_REWRITES.map((rewrite) => [rewrite.source, rewrite.destination]))

    expect(bySource.get(UMAMI_TRACKER_SRC)).toBe(`${UMAMI_ORIGIN}/script.js`)
    expect(bySource.get(UMAMI_RECORDER_SRC)).toBe(`${UMAMI_ORIGIN}/recorder.js`)
    expect(bySource.get(`${UMAMI_API_PREFIX}/send`)).toBe(`${UMAMI_ORIGIN}/api/send`)
    expect(bySource.get(`${UMAMI_API_PREFIX}/record`)).toBe(`${UMAMI_ORIGIN}/api/record`)
    expect(bySource.get(`${UMAMI_API_PREFIX}/websites/:id/recorder`)).toBe(`${UMAMI_ORIGIN}/api/websites/:id/recorder`)
  })

  it('exposes exactly the API endpoints the scripts call, with no catch-all', () => {
    const apiSources = UMAMI_REWRITES.map((rewrite) => rewrite.source).filter((source) =>
      source.startsWith(UMAMI_API_PREFIX),
    )

    expect(apiSources).toEqual([
      `${UMAMI_API_PREFIX}/send`,
      `${UMAMI_API_PREFIX}/record`,
      `${UMAMI_API_PREFIX}/websites/:id/recorder`,
    ])
    for (const source of apiSources) {
      expect(source).not.toContain('*')
    }
  })

  it('keeps every rewrite destination on the Umami origin', () => {
    for (const rewrite of UMAMI_REWRITES) {
      expect(rewrite.destination.startsWith(`${UMAMI_ORIGIN}/`)).toBe(true)
    }
  })
})

describe('createUmamiInjector', () => {
  afterEach(clearBrowser)

  it('injects the tracker and the recorder with the first-party attributes', () => {
    createUmamiInjector(environmentOf('/')).inject()

    const tracker = scriptOf(UMAMI_TRACKER_SRC)
    const recorder = scriptOf(UMAMI_RECORDER_SRC)

    expect(tracker?.dataset.websiteId).toBe(UMAMI_WEBSITE_ID)
    expect(tracker?.dataset.hostUrl).toBe(UMAMI_HOST_URL)
    expect(tracker?.dataset.beforeSend).toBe('__umamiBeforeSend')
    expect(tracker?.async).toBe(false)
    expect(recorder?.dataset.websiteId).toBe(UMAMI_WEBSITE_ID)
    expect(recorder?.dataset.hostUrl).toBe(UMAMI_HOST_URL)
    expect(recorder?.dataset.beforeSend).toBeUndefined()
  })

  it('injects the tracker before the recorder, so the API exists first', () => {
    createUmamiInjector(environmentOf('/')).inject()

    const scripts = [...document.head.querySelectorAll('script')].map((script) => script.getAttribute('src'))
    expect(scripts).toEqual([UMAMI_TRACKER_SRC, UMAMI_RECORDER_SRC])
  })

  it('cancels an absolute URL that points at an excluded path, and keeps the others', () => {
    createUmamiInjector(environmentOf('/')).inject()

    const beforeSend = window.__umamiBeforeSend
    expect(beforeSend).toBeDefined()

    const excluded = { url: 'https://softn.io/rendez-vous/secret-token' }
    const kept = { url: 'https://softn.io/contact' }

    expect(beforeSend?.('pageview', excluded)).toBe(false)
    expect(beforeSend?.('pageview', kept)).toBe(kept)
  })

  it('cancels a relative URL that points at an excluded path', () => {
    createUmamiInjector(environmentOf('/')).inject()

    expect(window.__umamiBeforeSend?.('pageview', { url: '/rendez-vous/secret-token' })).toBe(false)
    expect(window.__umamiBeforeSend?.('pageview', { url: '/preview' })).toBe(false)
    expect(window.__umamiBeforeSend?.('pageview', { url: '/preview/' })).toBe(false)
  })

  it('keeps a relative URL that points at an allowed path, resolved against the page origin', () => {
    createUmamiInjector(environmentOf('/contact')).inject()

    const kept = { url: '/politique-de-cookies' }
    expect(window.__umamiBeforeSend?.('pageview', kept)).toBe(kept)
  })

  it('fails closed on a malformed URL, and keeps a payload without URL', () => {
    createUmamiInjector(environmentOf('/')).inject()

    const malformed = { url: 'http://[' }
    const withoutUrl = { name: 'click' }

    expect(window.__umamiBeforeSend?.('event', malformed)).toBe(false)
    expect(window.__umamiBeforeSend?.('event', withoutUrl)).toBe(withoutUrl)
  })

  it('cancels the send and the session read once the audience consent is withdrawn', () => {
    let audience = true
    const env = environmentOf('/', { readConsent: () => ({ audience }) })
    createUmamiInjector(env).inject()

    const getSession = vi.fn(() => ({ cache: 'cache' }))
    window.umami = { getSession }

    const payload = { url: 'https://softn.io/contact' }
    expect(window.__umamiBeforeSend?.('pageview', payload)).toBe(payload)
    expect(window.umami.getSession?.()).toEqual({ cache: 'cache' })

    audience = false
    expect(window.__umamiBeforeSend?.('pageview', payload)).toBe(false)
    expect(window.umami.getSession?.()).toBeUndefined()
  })

  it('cancels the send while no consent record is stored', () => {
    createUmamiInjector(environmentOf('/', { readConsent: () => null })).inject()

    expect(window.__umamiBeforeSend?.('pageview', { url: 'https://softn.io/contact' })).toBe(false)
  })

  it('sends again when the audience consent is granted back', () => {
    let audience = false
    createUmamiInjector(environmentOf('/', { readConsent: () => ({ audience }) })).inject()

    const payload = { url: 'https://softn.io/contact' }
    expect(window.__umamiBeforeSend?.('pageview', payload)).toBe(false)

    audience = true
    expect(window.__umamiBeforeSend?.('pageview', payload)).toBe(payload)
  })

  it('stops the recorder from reading a session while the page is on an excluded path', () => {
    const env = environmentOf('/')
    createUmamiInjector(env).inject()

    const getSession = vi.fn(() => ({ cache: 'cache' }))
    window.umami = { getSession }

    // The guard installs on the first `before-send` call, before the recorder's first send.
    window.__umamiBeforeSend?.('pageview', { url: 'https://softn.io/' })

    expect(window.umami.getSession?.()).toEqual({ cache: 'cache' })

    env.location.pathname = '/rendez-vous/secret-token'
    expect(window.umami.getSession?.()).toBeUndefined()

    env.location.pathname = '/'
    expect(window.umami.getSession?.()).toEqual({ cache: 'cache' })
  })

  it('installs the recorder guard from the tracker load event', () => {
    const env = environmentOf('/')
    createUmamiInjector(env).inject()

    const getSession = vi.fn(() => ({ cache: 'cache' }))
    window.umami = { getSession }

    scriptOf(UMAMI_TRACKER_SRC)?.dispatchEvent(new Event('load'))

    env.location.pathname = '/preview'
    expect(window.umami.getSession?.()).toBeUndefined()
  })

  it('installs the recorder guard once, whatever the number of calls', () => {
    const env = environmentOf('/')
    createUmamiInjector(env).inject()

    const getSession = vi.fn(() => ({ cache: 'cache' }))
    window.umami = { getSession }

    window.__umamiBeforeSend?.('pageview', { url: 'https://softn.io/' })
    const guarded = window.umami.getSession
    window.__umamiBeforeSend?.('pageview', { url: 'https://softn.io/' })

    expect(window.umami.getSession).toBe(guarded)
  })

  it('leaves the recorder alone when the tracker never sets its API', () => {
    createUmamiInjector(environmentOf('/')).inject()

    expect(() => window.__umamiBeforeSend?.('pageview', { url: 'https://softn.io/' })).not.toThrow()
    expect(window.umami).toBeUndefined()
  })
})

describe('installUmami', () => {
  afterEach(() => {
    clearBrowser()
    vi.resetModules()
  })

  it('injects once, whatever the number of calls', async () => {
    const { installUmami } = await import('./umami')

    installUmami()
    installUmami()

    expect(document.head.querySelectorAll(`script[src="${UMAMI_TRACKER_SRC}"]`)).toHaveLength(1)
    expect(document.head.querySelectorAll(`script[src="${UMAMI_RECORDER_SRC}"]`)).toHaveLength(1)
  })

  it('never injects on an excluded path', async () => {
    window.history.replaceState(null, '', '/rendez-vous/secret-token')
    const { installUmami } = await import('./umami')

    installUmami()

    expect(document.head.querySelectorAll('script')).toHaveLength(0)
  })
})

describe('registerUmamiLoader', () => {
  afterEach(() => {
    clearBrowser()
    vi.resetModules()
  })

  it('injects the scripts when the stored record grants the audience consent', async () => {
    storeConsent(true)
    const { registerUmamiLoader } = await import('./umami')

    registerUmamiLoader()

    expect(scriptOf(UMAMI_TRACKER_SRC)).not.toBeNull()
    expect(scriptOf(UMAMI_RECORDER_SRC)).not.toBeNull()
  })

  it('injects nothing when the stored record refuses the audience consent', async () => {
    storeConsent(false)
    const { registerUmamiLoader } = await import('./umami')

    registerUmamiLoader()

    expect(document.head.querySelectorAll('script')).toHaveLength(0)
  })

  it('injects nothing when no choice is stored', async () => {
    const { registerUmamiLoader } = await import('./umami')

    registerUmamiLoader()

    expect(document.head.querySelectorAll('script')).toHaveLength(0)
  })
})
