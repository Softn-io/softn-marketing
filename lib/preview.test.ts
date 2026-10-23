import { afterEach, describe, expect, it, vi } from 'vitest'
import { isPreviewRouteEnabled } from './preview'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isPreviewRouteEnabled', () => {
  it('is enabled in development, with or without the flag', () => {
    expect(isPreviewRouteEnabled({ NODE_ENV: 'development', ENABLE_PREVIEW_ROUTE: 'false' })).toBe(true)
    expect(isPreviewRouteEnabled({ NODE_ENV: 'development', ENABLE_PREVIEW_ROUTE: 'true' })).toBe(true)
  })

  it('is enabled outside development only when the flag is true', () => {
    expect(isPreviewRouteEnabled({ NODE_ENV: 'production', ENABLE_PREVIEW_ROUTE: 'true' })).toBe(true)
    expect(isPreviewRouteEnabled({ NODE_ENV: 'test', ENABLE_PREVIEW_ROUTE: 'true' })).toBe(true)
  })

  it('is disabled in production without the flag', () => {
    expect(isPreviewRouteEnabled({ NODE_ENV: 'production', ENABLE_PREVIEW_ROUTE: 'false' })).toBe(false)
    expect(isPreviewRouteEnabled({ NODE_ENV: 'test', ENABLE_PREVIEW_ROUTE: 'false' })).toBe(false)
  })

  it('reads the validated environment on every call, not once at import', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ENABLE_PREVIEW_ROUTE', 'false')
    expect(isPreviewRouteEnabled()).toBe(false)

    vi.stubEnv('ENABLE_PREVIEW_ROUTE', 'true')
    expect(isPreviewRouteEnabled()).toBe(true)
  })

  it('is disabled in production when the flag is unset, via the validated default', () => {
    vi.stubEnv('NODE_ENV', 'production')
    // Stub first so `afterEach` restores the original value, then unset the flag to
    // prove the schema default ('false') keeps the route closed in production.
    vi.stubEnv('ENABLE_PREVIEW_ROUTE', 'true')
    delete process.env.ENABLE_PREVIEW_ROUTE
    expect(isPreviewRouteEnabled()).toBe(false)
  })

  it('fails closed on a malformed flag: the validated read rejects it', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ENABLE_PREVIEW_ROUTE', 'yes')
    expect(() => isPreviewRouteEnabled()).toThrow(/Invalid environment variables/)
  })
})
