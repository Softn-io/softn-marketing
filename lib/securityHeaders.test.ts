import { describe, expect, it } from 'vitest'
import {
  buildNonceContentSecurityPolicy,
  buildSecurityHeaders,
  buildStaticContentSecurityPolicy,
  cspHashSourceOf,
} from './securityHeaders'

const directiveOf = (policy: string, name: string): string | undefined => {
  return policy.split('; ').find((directive) => directive.startsWith(`${name} `) || directive === name)
}

describe('cspHashSourceOf', () => {
  it('builds the sha256 source of a known script content', () => {
    // Fixed vector: base64(sha256("alert(1)")).
    expect(cspHashSourceOf('alert(1)')).toBe("'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='")
  })

  it('hashes the exact content: trailing whitespace gives another source', () => {
    expect(cspHashSourceOf('alert(1)')).not.toBe(cspHashSourceOf('alert(1) '))
  })
})

describe('buildStaticContentSecurityPolicy', () => {
  it('locks down framing, plugins, base URI and form targets', () => {
    const policy = buildStaticContentSecurityPolicy({ isDev: false })
    expect(directiveOf(policy, 'default-src')).toBe("default-src 'self'")
    expect(directiveOf(policy, 'object-src')).toBe("object-src 'none'")
    expect(directiveOf(policy, 'base-uri')).toBe("base-uri 'self'")
    expect(directiveOf(policy, 'form-action')).toBe("form-action 'self'")
    expect(directiveOf(policy, 'frame-ancestors')).toBe("frame-ancestors 'none'")
    expect(directiveOf(policy, 'upgrade-insecure-requests')).toBeDefined()
  })

  it('allows no third-party origin', () => {
    expect(buildStaticContentSecurityPolicy({ isDev: false })).not.toMatch(/https?:/)
  })

  it("blocks inline event-handler attributes with script-src-attr 'none' in every environment", () => {
    for (const isDev of [false, true]) {
      expect(directiveOf(buildStaticContentSecurityPolicy({ isDev }), 'script-src-attr')).toBe("script-src-attr 'none'")
    }
  })

  it("allows 'unsafe-eval' in development only", () => {
    expect(buildStaticContentSecurityPolicy({ isDev: true })).toContain("'unsafe-eval'")
    expect(buildStaticContentSecurityPolicy({ isDev: false })).not.toContain("'unsafe-eval'")
  })
})

describe('buildNonceContentSecurityPolicy', () => {
  const policyOf = (isDev = false): string =>
    buildNonceContentSecurityPolicy({ nonce: 'abc123', isDev, themeScriptHash: "'sha256-themehash'" })

  it('requires the nonce for inline scripts and trusts the scripts they load', () => {
    expect(directiveOf(policyOf(), 'script-src')).toBe(
      "script-src 'self' 'nonce-abc123' 'strict-dynamic' 'sha256-themehash'",
    )
  })

  it("drops 'unsafe-inline' from script-src and keeps script-src-attr 'none'", () => {
    const policy = policyOf()
    expect(directiveOf(policy, 'script-src')).not.toContain("'unsafe-inline'")
    expect(directiveOf(policy, 'script-src-attr')).toBe("script-src-attr 'none'")
  })

  it("keeps style-src on 'unsafe-inline' for the styles React and Next.js emit", () => {
    expect(directiveOf(policyOf(), 'style-src')).toBe("style-src 'self' 'unsafe-inline'")
  })

  it('locks down framing, plugins, base URI and form targets, and allows no third-party origin', () => {
    const policy = policyOf()
    expect(directiveOf(policy, 'default-src')).toBe("default-src 'self'")
    expect(directiveOf(policy, 'object-src')).toBe("object-src 'none'")
    expect(directiveOf(policy, 'base-uri')).toBe("base-uri 'self'")
    expect(directiveOf(policy, 'form-action')).toBe("form-action 'self'")
    expect(directiveOf(policy, 'frame-ancestors')).toBe("frame-ancestors 'none'")
    expect(directiveOf(policy, 'upgrade-insecure-requests')).toBeDefined()
    expect(policy).not.toMatch(/https?:/)
  })

  it("allows 'unsafe-eval' in development only", () => {
    expect(policyOf(true)).toContain("'unsafe-eval'")
    expect(policyOf(false)).not.toContain("'unsafe-eval'")
  })
})

describe('buildSecurityHeaders', () => {
  const rules = buildSecurityHeaders({ isDev: false })
  const [globalRule, manageRule, previewRule] = rules
  const valueOf = (key: string) => globalRule?.headers.find((header) => header.key === key)?.value

  it('applies the static CSP and the other security headers to every path', () => {
    expect(rules).toHaveLength(3)
    expect(buildSecurityHeaders({ isDev: true })).toHaveLength(3)
    expect(globalRule?.source).toBe('/:path*')
    expect(valueOf('Content-Security-Policy')).toBe(buildStaticContentSecurityPolicy({ isDev: false }))
  })

  it('marks the preview route as noindex, and only the preview route', () => {
    const noindexRules = rules.filter(({ headers }) => headers.some(({ key }) => key === 'X-Robots-Tag'))

    expect(noindexRules.map(({ source }) => source)).toEqual(['/preview'])
    expect(previewRule?.headers).toEqual([{ key: 'X-Robots-Tag', value: 'noindex' }])
    expect(valueOf('X-Robots-Tag')).toBeUndefined()
  })

  it('sends no referrer from the manage page, without touching the other routes', () => {
    expect(manageRule?.source).toBe('/rendez-vous/:path*')
    expect(manageRule?.headers).toEqual([{ key: 'Referrer-Policy', value: 'no-referrer' }])
    // The override names one header only: the global policy still applies to that path.
    expect(valueOf('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
  })

  it('sets HSTS for two years without preload', () => {
    expect(valueOf('Strict-Transport-Security')).toBe('max-age=63072000; includeSubDomains')
  })

  it('sets referrer policy and nosniff', () => {
    expect(valueOf('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(valueOf('X-Content-Type-Options')).toBe('nosniff')
  })

  it('denies sensitive browser features', () => {
    const policy = valueOf('Permissions-Policy') ?? ''
    for (const feature of ['camera', 'microphone', 'geolocation', 'payment', 'usb']) {
      expect(policy).toContain(`${feature}=()`)
    }
  })
})
