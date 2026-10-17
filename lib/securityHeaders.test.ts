import { describe, expect, it } from "vitest"
import { buildContentSecurityPolicy, buildSecurityHeaders } from "./securityHeaders"

const directiveOf = (policy: string, name: string): string | undefined => {
  return policy.split("; ").find((directive) => directive.startsWith(`${name} `) || directive === name)
}

describe("buildContentSecurityPolicy", () => {
  it("locks down framing, plugins, base URI and form targets", () => {
    const policy = buildContentSecurityPolicy({ isDev: false })
    expect(directiveOf(policy, "default-src")).toBe("default-src 'self'")
    expect(directiveOf(policy, "object-src")).toBe("object-src 'none'")
    expect(directiveOf(policy, "base-uri")).toBe("base-uri 'self'")
    expect(directiveOf(policy, "form-action")).toBe("form-action 'self'")
    expect(directiveOf(policy, "frame-ancestors")).toBe("frame-ancestors 'none'")
    expect(directiveOf(policy, "upgrade-insecure-requests")).toBeDefined()
  })

  it("allows no third-party origin", () => {
    expect(buildContentSecurityPolicy({ isDev: false })).not.toMatch(/https?:/)
  })

  it("allows 'unsafe-eval' in development only", () => {
    expect(buildContentSecurityPolicy({ isDev: true })).toContain("'unsafe-eval'")
    expect(buildContentSecurityPolicy({ isDev: false })).not.toContain("'unsafe-eval'")
  })
})

describe("buildSecurityHeaders", () => {
  const [rule] = buildSecurityHeaders({ isDev: false })
  const valueOf = (key: string) => rule?.headers.find((header) => header.key === key)?.value

  it("applies a single rule to every path", () => {
    expect(buildSecurityHeaders({ isDev: false })).toHaveLength(1)
    expect(rule?.source).toBe("/:path*")
  })

  it("sets HSTS for two years without preload", () => {
    expect(valueOf("Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains")
  })

  it("sets referrer policy and nosniff", () => {
    expect(valueOf("Referrer-Policy")).toBe("strict-origin-when-cross-origin")
    expect(valueOf("X-Content-Type-Options")).toBe("nosniff")
  })

  it("denies sensitive browser features", () => {
    const policy = valueOf("Permissions-Policy") ?? ""
    for (const feature of ["camera", "microphone", "geolocation", "payment", "usb"]) {
      expect(policy).toContain(`${feature}=()`)
    }
  })

  it("includes the Content-Security-Policy header", () => {
    expect(valueOf("Content-Security-Policy")).toBe(buildContentSecurityPolicy({ isDev: false }))
  })
})
