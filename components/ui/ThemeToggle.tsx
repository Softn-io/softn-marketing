"use client"

import { useSyncExternalStore } from "react"
import { nav } from "@/locales/fr/hero"
import { THEME_STORAGE_KEY, type Theme } from "@/lib/theme"

const LIGHT_QUERY = "(prefers-color-scheme: light)"

/** Effective theme: explicit `data-theme` on <html>, else the system preference, else dark (brand default). */
function readEffectiveTheme(): Theme {
  const explicit = document.documentElement.getAttribute("data-theme")
  if (explicit === "light" || explicit === "dark") return explicit
  return window.matchMedia(LIGHT_QUERY).matches ? "light" : "dark"
}

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(LIGHT_QUERY)
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
  media.addEventListener("change", onChange)
  return () => {
    observer.disconnect()
    media.removeEventListener("change", onChange)
  }
}

/** Server snapshot: dark is the brand default; the client corrects it on hydration. */
function getServerSnapshot(): Theme {
  return "dark"
}

function applyExplicitTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Storage unavailable (private mode, blocked): the choice still applies for this page view.
  }
}

/**
 * Icon-only button switching between dark and light. Its label and icon follow the
 * effective theme; a click stores an explicit choice and sets `data-theme` on <html>.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readEffectiveTheme, getServerSnapshot)
  const isDark = theme === "dark"
  const label = isDark ? nav.themeToggle.toLight : nav.themeToggle.toDark

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => applyExplicitTheme(isDark ? "light" : "dark")}
      suppressHydrationWarning
      className="inline-flex size-10 items-center justify-center rounded-pill text-foreground transition-colors hover:text-foreground-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground focus-visible:shadow-input-focus-ring"
    >
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        {isDark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </>
        ) : (
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        )}
      </svg>
    </button>
  )
}
