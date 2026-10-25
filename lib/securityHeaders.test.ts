import { describe, expect, it } from 'vitest'
import { buildContentSecurityPolicy, buildSecurityHeaders } from './securityHeaders'

const directiveOf = (policy: string, name: string): string | undefined => {
  return policy.split('; ').find((directive) => directive.startsWith(`${name} `) || directive === name)
}

describe('buildContentSecurityPolicy', () => {
  it('locks down framing, plugins, base URI and form targets', () => {
    const policy = buildContentSecurityPolicy({ isDev: false })
    expect(directiveOf(policy, 'default-src')).toBe("default-src 'self'")
    expect(directiveOf(policy, 'object-src')).toBe("object-src 'none'")
    expect(directiveOf(policy, 'base-uri')).toBe("base-uri 'self'")
    expect(directiveOf(policy, 'form-action')).toBe("form-action 'self'")
    expect(directiveOf(policy, 'frame-ancestors')).toBe("frame-ancestors 'none'")
    expect(directiveOf(policy, 'upgrade-insecure-requests')).toBeDefined()
  })

  it('allows no third-party origin', () => {
    expect(buildContentSecurityPolicy({ isDev: false })).not.toMatch(/https?:/)
  })

  it("allows 'unsafe-eval' in development only", () => {
    expect(buildContentSecurityPolicy({ isDev: true })).toContain("'unsafe-eval'")
    expect(buildContentSecurityPolicy({ isDev: false })).not.toContain("'unsafe-eval'")
  })
})

describe('buildSecurityHeaders', () => {
  const rules = buildSecurityHeaders({ isDev: false })
  const [globalRule] = rules
  const valueOf = (key: string) => globalRule?.headers.find((header) => header.key === key)?.value

  it('applies the global rule to every path', () => {
    expect(rules).toHaveLength(2)
    expect(buildSecurityHeaders({ isDev: true })).toHaveLength(2)
    expect(globalRule?.source).toBe('/:path*')
  })

  it('marks the preview route as noindex, and only the preview route', () => {
    const noindexRules = rules.filter(({ headers }) => headers.some(({ key }) => key === 'X-Robots-Tag'))

    expect(noindexRules.map(({ source }) => source)).toEqual(['/preview'])
    expect(noindexRules[0]?.headers).toEqual([{ key: 'X-Robots-Tag', value: 'noindex' }])
    expect(valueOf('X-Robots-Tag')).toBeUndefined()
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

  it('includes the Content-Security-Policy header', () => {
    expect(valueOf('Content-Security-Policy')).toBe(buildContentSecurityPolicy({ isDev: false }))
  })
})
