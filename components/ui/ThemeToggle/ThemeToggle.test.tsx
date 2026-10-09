// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { nav } from "@/locales/fr/hero"
import { THEME_STORAGE_KEY } from "@/lib/theme"
import { ThemeToggle } from "./ThemeToggle"

type MediaListener = () => void

let prefersLight = false
let listeners: MediaListener[] = []

function stubMatchMedia() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return prefersLight
      },
      addEventListener: (_: string, cb: MediaListener) => listeners.push(cb),
      removeEventListener: (_: string, cb: MediaListener) => {
        listeners = listeners.filter((l) => l !== cb)
      },
    })),
  )
}

beforeEach(() => {
  prefersLight = false
  listeners = []
  document.documentElement.removeAttribute("data-theme")
  localStorage.clear()
  stubMatchMedia()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const button = (name: string) => screen.getByRole("button", { name })

describe("ThemeToggle", () => {
  it("offers light mode when dark (default)", () => {
    render(<ThemeToggle />)
    expect(button(nav.themeToggle.toLight)).toBeTruthy()
  })

  it("click sets data-theme, stores the choice and updates the label", async () => {
    render(<ThemeToggle />)
    await act(async () => fireEvent.click(button(nav.themeToggle.toLight)))
    expect(document.documentElement.getAttribute("data-theme")).toBe("light")
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light")
    expect(button(nav.themeToggle.toDark)).toBeTruthy()

    await act(async () => fireEvent.click(button(nav.themeToggle.toDark)))
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark")
  })

  it("explicit data-theme wins over the system preference", () => {
    prefersLight = true
    document.documentElement.setAttribute("data-theme", "dark")
    render(<ThemeToggle />)
    expect(button(nav.themeToggle.toLight)).toBeTruthy()
  })

  it("still applies the theme when storage throws", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError")
    })
    render(<ThemeToggle />)
    await act(async () => fireEvent.click(button(nav.themeToggle.toLight)))
    expect(document.documentElement.getAttribute("data-theme")).toBe("light")
    expect(button(nav.themeToggle.toDark)).toBeTruthy()
  })

  it("system preference change updates the label when no data-theme", async () => {
    render(<ThemeToggle />)
    expect(button(nav.themeToggle.toLight)).toBeTruthy()
    prefersLight = true
    await act(async () => listeners.forEach((l) => l()))
    expect(button(nav.themeToggle.toDark)).toBeTruthy()
  })

  it("unsubscribes from the media query on unmount", () => {
    const { unmount } = render(<ThemeToggle />)
    expect(listeners.length).toBeGreaterThan(0)
    unmount()
    expect(listeners.length).toBe(0)
  })
})
