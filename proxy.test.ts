import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { cspHashSourceOf } from './lib/securityHeaders'
import { themeInitScript } from './lib/theme'
import { proxy } from './proxy'

const requestFor = (path: string): NextRequest => new NextRequest(new URL(path, 'http://localhost:3100'))

const nonceOf = (policy: string): string | undefined => /'nonce-([^']+)'/.exec(policy)?.[1]

describe('proxy', () => {
  it('sets the per-request nonce policy on the response', () => {
    const policy = proxy(requestFor('/preview')).headers.get('content-security-policy') ?? ''
    const scriptSrc = policy.split('; ').find((directive) => directive.startsWith('script-src ')) ?? ''

    expect(policy).toContain("script-src-attr 'none'")
    expect(scriptSrc).toContain("'strict-dynamic'")
    expect(scriptSrc).not.toContain("'unsafe-inline'")
    expect(nonceOf(policy)).toBeTruthy()
  })

  it('forwards the same policy on the request headers, where the renderer reads the nonce', () => {
    const response = proxy(requestFor('/preview'))
    const responsePolicy = response.headers.get('content-security-policy') ?? ''
    const forwardedPolicy = response.headers.get('x-middleware-request-content-security-policy') ?? ''

    expect(forwardedPolicy).toBe(responsePolicy)
    expect(nonceOf(forwardedPolicy)).toBeTruthy()
  })

  it('ignores case variants and nested paths, which keep the static policy', () => {
    for (const path of ['/PREVIEW', '/RENDEZ-VOUS/abc', '/rendez-vous/a/b', '/preview/']) {
      const response = proxy(requestFor(path))

      expect(response.headers.get('content-security-policy'), path).toBeNull()
      expect(response.headers.get('x-middleware-request-content-security-policy'), path).toBeNull()
    }
  })

  it('sets the policy on the exact lowercase routes', () => {
    for (const path of ['/preview', '/rendez-vous/abc']) {
      expect(nonceOf(proxy(requestFor(path)).headers.get('content-security-policy') ?? ''), path).toBeTruthy()
    }
  })

  it('allows the shared inline theme script by hash', () => {
    const policy = proxy(requestFor('/preview')).headers.get('content-security-policy') ?? ''

    expect(policy).toContain(cspHashSourceOf(themeInitScript))
  })

  it('generates a fresh nonce on every request', () => {
    const first = proxy(requestFor('/preview')).headers.get('content-security-policy') ?? ''
    const second = proxy(requestFor('/preview')).headers.get('content-security-policy') ?? ''

    expect(nonceOf(first)).toBeTruthy()
    expect(nonceOf(first)).not.toBe(nonceOf(second))
  })
})
