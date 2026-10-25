import type { NextConfig } from 'next'
import { buildSecurityHeaders } from './lib/securityHeaders'

const nextConfig: NextConfig = {
  reactCompiler: true,
  async headers() {
    return buildSecurityHeaders({
      isDev: process.env.NODE_ENV === 'development',
    })
  },
}

export default nextConfig
