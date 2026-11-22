'use client'

import dynamic from 'next/dynamic'

const CookieConsent = dynamic(() => import('./CookieConsent').then((module) => module.CookieConsent), {
  ssr: false,
})

/**
 * Minimal client wrapper that mounts the consent layer after hydration. The layer itself is a
 * separate chunk, so the banner and the dialog do not weigh on the initial bundle; nothing is
 * server-rendered for them.
 *
 * @returns The lazily mounted consent layer.
 */
export const CookieConsentLoader = () => <CookieConsent />
