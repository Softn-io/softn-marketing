import type { NextConfig } from 'next'
import { UMAMI_REWRITES } from './lib/analytics/umamiRoutes'
import { buildSecurityHeaders } from './lib/securityHeaders'

const nextConfig: NextConfig = {
  reactCompiler: true,
  outputFileTracingIncludes: {
    '/api/assistant': ['./locales/fr/okf/*.md'],
  },
  outputFileTracingExcludes: {
    '/api/assistant': ['./docs/**/*'],
  },
  async headers() {
    return buildSecurityHeaders({
      isDev: process.env.NODE_ENV === 'development',
    })
  },
  async rewrites() {
    return [...UMAMI_REWRITES]
  },
}

export default nextConfig
