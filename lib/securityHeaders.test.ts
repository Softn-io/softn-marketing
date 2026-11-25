import { describe, expect, it } from 'vitest'
import {
  buildNonceContentSecurityPolicy,
  buildSecurityHeaders,
  buildStaticContentSecurityPolicy,
  cspHashSourceOf,
  HOME_FRAME_ANCESTORS,
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

  it('takes the frame-ancestors value the home page passes, and keeps none by default', () => {
    const widened = buildStaticContentSecurityPolicy({ isDev: false, frameAncestors: HOME_FRAME_ANCESTORS })

    expect(directiveOf(widened, 'frame-ancestors')).toBe(`frame-ancestors ${HOME_FRAME_ANCESTORS}`)
    expect(directiveOf(buildStaticContentSecurityPolicy({ isDev: false }), 'frame-ancestors')).toBe(
      "frame-ancestors 'none'",
    )
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

  it('allows the blob workers of the anti-bot widget, and no other worker source', () => {
    expect(directiveOf(buildStaticContentSecurityPolicy({ isDev: false }), 'worker-src')).toBe('worker-src blob:')
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

  it('keeps the blob worker source the anti-bot widget needs, without opening a third-party origin', () => {
    expect(directiveOf(policyOf(), 'worker-src')).toBe('worker-src blob:')
  })
})

describe('buildSecurityHeaders', () => {
  const rules = buildSecurityHeaders({ isDev: false })
  const [globalRule, homeRule, manageRule, previewRule] = rules
  const valueOf = (key: string) => globalRule?.headers.find((header) => header.key === key)?.value
  const cspOf = (rule: (typeof rules)[number] | undefined): string =>
    rule?.headers.find((header) => header.key === 'Content-Security-Policy')?.value ?? ''

  it('applies the static CSP and the other security headers to every path', () => {
    expect(rules).toHaveLength(4)
    expect(buildSecurityHeaders({ isDev: true })).toHaveLength(4)
    expect(globalRule?.source).toBe('/:path*')
    expect(valueOf('Content-Security-Policy')).toBe(buildStaticContentSecurityPolicy({ isDev: false }))
  })

  it('widens frame-ancestors on the home page alone, without adding a third-party script or data origin', () => {
    expect(homeRule?.source).toBe('/')
    expect(homeRule?.headers.map(({ key }) => key)).toEqual(['Content-Security-Policy'])

    const homePolicy = cspOf(homeRule)
    expect(directiveOf(homePolicy, 'frame-ancestors')).toBe(`frame-ancestors ${HOME_FRAME_ANCESTORS}`)
    expect(directiveOf(homePolicy, 'script-src')).not.toContain('umami.softn.io')
    // No `connect-src` is declared: `default-src 'self'` is what governs the scripts' requests.
    expect(directiveOf(homePolicy, 'connect-src')).toBeUndefined()
    expect(directiveOf(homePolicy, 'default-src')).toBe("default-src 'self'")
    expect(cspOf(globalRule)).not.toContain('umami.softn.io')
  })

  it('keeps frame-ancestors at none on every other path, including the nonce routes', () => {
    expect(directiveOf(cspOf(globalRule), 'frame-ancestors')).toBe("frame-ancestors 'none'")
    expect(
      directiveOf(
        buildNonceContentSecurityPolicy({ nonce: 'abc123', isDev: false, themeScriptHash: "'sha256-themehash'" }),
        'frame-ancestors',
      ),
    ).toBe("frame-ancestors 'none'")
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
