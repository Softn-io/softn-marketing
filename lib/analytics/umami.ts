/**
 * Umami loader: the audience tracker and the session recorder, injected only after the audience
 * consent and only from the site's own origin.
 *
 * Both scripts are requested through the first-party proxy prefix declared in `umamiRoutes.ts`, so
 * the CSP keeps `'self'` only and no request reaches a third-party origin before consent. The
 * website ID is a public value, kept here rather than in the environment.
 *
 * The gate contract stays the same: a refusal stops future loads, and an already loaded script stays
 * for the rest of the page's life. The loader writes no storage key of its own. It reads the stored
 * record on every send, so a withdrawal also stops the tracker at once and silences the recorder
 * best-effort, without waiting for the next page load. Nothing is injected on the booking manage
 * page (its token would be sent to Umami) nor on the preview page.
 */

import { consentStore } from '@/lib/consent'
import { consentGate } from './gate'
import { UMAMI_HOST_URL, UMAMI_RECORDER_SRC, UMAMI_TRACKER_SRC } from './umamiRoutes'

/** Public website ID of the self-hosted Umami instance. */
export const UMAMI_WEBSITE_ID = '2ae6e437-d82c-46f8-b6ba-4c0f868abe3d'

/** Name the tracker reads in `data-before-send`; the function itself is installed on `window`. */
const BEFORE_SEND_HANDLER_NAME = '__umamiBeforeSend'

/**
 * Path of the booking manage page, mirrored from `BOOKING_MANAGE_PATH` in
 * `lib/booking/manageToken.ts`: the loader runs in the browser, and that module pulls `node:crypto`
 * and the server environment, so it cannot be imported here. The colocated test pins the two
 * together, so a rename fails the suite instead of silently starting to track the token page.
 */
const MANAGE_PATH = '/rendez-vous'

/** Path of the gated preview page. */
const PREVIEW_PATH = '/preview'

/** Payload shape the tracker hands to the `before-send` hook; only `url` is read here. */
export type UmamiPayload = Record<string, unknown>

/** Hook the tracker calls before each send; a falsy return cancels the send. */
export type UmamiBeforeSend = (type: string, payload: UmamiPayload) => UmamiPayload | false

/** Reads the stored consent record; only the audience flag is used. */
export type UmamiConsentReader = () => { readonly audience: boolean } | null

/** Browser surface the loader touches, injectable for tests. */
export type UmamiEnvironment = {
  /** Document the two scripts are appended to. */
  readonly document: Document
  /** Current location, read for the path exclusion. */
  readonly location: { pathname: string }
  /** Origin of the current page, used to resolve a relative payload URL. */
  readonly origin: string
  /** Reads the current consent record, checked before every send. */
  readonly readConsent: UmamiConsentReader
  /** Window the tracker's public API and the `before-send` hook live on. */
  readonly window: Window
}

/** Injects the two Umami scripts once, for one environment. */
export type UmamiInjector = {
  /** Appends the tracker and the recorder to the document head. */
  readonly inject: () => void
}

declare global {
  interface Window {
    /** Hook the tracker calls before each send; installed by the loader. */
    __umamiBeforeSend?: UmamiBeforeSend
    /** Public tracker API, set by the tracker script once it loads. */
    umami?: {
      /** Session cache the recorder reads before every send. */
      getSession?: () => { readonly cache?: unknown } | undefined
    }
  }
}

/**
 * Routes whose URL must never reach Umami: the booking manage page carries its token in the path,
 * and the gated preview page must stay out of the measurement.
 *
 * @param pathname Path of the page, as `window.location.pathname` exposes it.
 * @returns `true` when neither script may load nor report from that path.
 */
export const isUmamiExcludedPath = (pathname: string): boolean =>
  pathname === PREVIEW_PATH ||
  pathname === `${PREVIEW_PATH}/` ||
  pathname === MANAGE_PATH ||
  pathname.startsWith(`${MANAGE_PATH}/`)

/**
 * Whether a URL reported by the tracker points at an excluded path.
 *
 * Fails closed: a relative URL is resolved against the page origin, and any non-empty string that
 * still cannot be parsed is treated as excluded, so an unparsable payload never reaches Umami.
 *
 * @param url URL of a payload, or an empty string when the payload carries none.
 * @param origin Origin of the current page, used as the base of a relative URL.
 * @returns `true` when the URL belongs to an excluded path or cannot be parsed.
 */
const isExcludedUrl = (url: string, origin: string): boolean => {
  if (url === '') return false

  try {
    return isUmamiExcludedPath(new URL(url, origin).pathname)
  } catch {
    return true
  }
}

/**
 * Whether the stored consent record still grants the audience category.
 *
 * @param env Environment whose consent reader is queried.
 * @returns `true` only when a valid record is stored and its audience flag is on.
 */
const isAudienceGranted = (env: UmamiEnvironment): boolean => {
  const record = env.readConsent()
  return record !== null && record.audience
}

/**
 * Builds an injector for one environment. Exported for tests: the application uses
 * {@link installUmami}, which builds one around the browser globals.
 *
 * The injector installs the `before-send` hook before the tracker loads. The hook reads the stored
 * consent record on every send, so a withdrawal cancels the very next send, and it also cancels a
 * client-side navigation into an excluded path. The injector wraps the tracker's `getSession` once
 * the API exists: the recorder reads that session cache before every send and exposes no documented
 * runtime stop, so returning `undefined` there — on withdrawal or on an excluded path — is a
 * best-effort guard on an undocumented internal, as observed on 2026-11-24 (the instance exposes no
 * version endpoint), not a guarantee. The load-time exclusion in {@link installUmami} is the
 * primary barrier.
 *
 * @param env Document, location, origin, consent reader and window the injector touches.
 * @returns The injector, whose `inject` appends the two scripts in order.
 */
export const createUmamiInjector = (env: UmamiEnvironment): UmamiInjector => {
  let recorderGuarded = false

  const guardRecorder = (): void => {
    if (recorderGuarded) return

    const umami = env.window.umami
    if (umami === undefined || typeof umami.getSession !== 'function') return

    recorderGuarded = true
    const originalGetSession = umami.getSession
    umami.getSession = () =>
      isAudienceGranted(env) && !isUmamiExcludedPath(env.location.pathname) ? originalGetSession() : undefined
  }

  const beforeSend: UmamiBeforeSend = (type, payload) => {
    guardRecorder()
    if (!isAudienceGranted(env)) return false

    const url = typeof payload['url'] === 'string' ? payload['url'] : ''
    return isExcludedUrl(url, env.origin) ? false : payload
  }

  const inject = (): void => {
    env.window.__umamiBeforeSend = beforeSend

    const tracker = env.document.createElement('script')
    tracker.src = UMAMI_TRACKER_SRC
    // Dynamic scripts are async by default; `async = false` keeps the tracker ahead of the recorder.
    tracker.async = false
    tracker.dataset['websiteId'] = UMAMI_WEBSITE_ID
    tracker.dataset['hostUrl'] = UMAMI_HOST_URL
    tracker.dataset['beforeSend'] = BEFORE_SEND_HANDLER_NAME
    tracker.addEventListener('load', guardRecorder)
    env.document.head.append(tracker)

    const recorder = env.document.createElement('script')
    recorder.src = UMAMI_RECORDER_SRC
    recorder.async = false
    recorder.dataset['websiteId'] = UMAMI_WEBSITE_ID
    recorder.dataset['hostUrl'] = UMAMI_HOST_URL
    env.document.head.append(recorder)
  }

  return { inject }
}

/**
 * Whether the singleton loader already injected the scripts in this page. The gate runs the loader
 * at most once, and this flag additionally protects a direct caller.
 */
let installed = false

/**
 * Injects the tracker and the recorder through the consent gate's loader contract.
 *
 * Idempotent: the first call injects, later calls do nothing. Nothing is injected on an excluded
 * path, so the booking manage page and the preview page never load Umami.
 */
export const installUmami = (): void => {
  if (installed) return
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (isUmamiExcludedPath(window.location.pathname)) return

  installed = true
  createUmamiInjector({
    document,
    location: window.location,
    origin: window.location.origin,
    readConsent: () => consentStore.getSnapshot(),
    window,
  }).inject()
}

/**
 * Registers the Umami loader on the shared consent gate. Called once by the consent layer; the
 * gate runs the loader when the audience consent is already granted, or on the next grant.
 */
export const registerUmamiLoader = (): void => {
  consentGate.register(installUmami)
}
