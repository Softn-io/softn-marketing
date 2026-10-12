"use client"

import { Moon, SunDim } from "lucide-react"
import { useSyncExternalStore } from "react"
import { nav } from "@/locales/fr/hero"
import { THEME_STORAGE_KEY, type Theme } from "@/lib/theme"
import styles from "./ThemeToggle.module.css"

const LIGHT_THEME_PREFERENCE = "(prefers-color-scheme: light)"

/** Effective theme: explicit `data-theme` on <html>, else the system preference, else dark (brand default). */
function readEffectiveTheme(): Theme {
  const dataTheme = document.documentElement.getAttribute("data-theme")
  if (dataTheme === "light" || dataTheme === "dark") return dataTheme
  return window.matchMedia(LIGHT_THEME_PREFERENCE).matches ? "light" : "dark"
}

function subscribeToThemeChanges(onChange: () => void): () => void {
  const media = window.matchMedia(LIGHT_THEME_PREFERENCE)
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

function applyDataTheme(theme: Theme): void {
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
  const theme = useSyncExternalStore(subscribeToThemeChanges, readEffectiveTheme, getServerSnapshot)
  const isDark = theme === "dark"
  const label = isDark ? nav.themeToggle.toLight : nav.themeToggle.toDark

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => applyDataTheme(isDark ? 'light' : 'dark')}
      suppressHydrationWarning
      className={`${styles["toggle-theme"]} inline-flex size-10 items-center justify-center rounded-pill text-foreground-secondary transition-colors hover:text-foreground`}
    >
      {isDark ? (
        <SunDim size={20} aria-hidden="true" focusable="false" />
      ) : (
        <Moon size={20} aria-hidden="true" focusable="false" />
      )}
    </button>
  );
}
