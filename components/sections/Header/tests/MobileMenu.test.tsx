// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OPEN_CHATBOT_EVENT } from "@/lib/chatbotEvents"
import { MobileMenu } from "../components/MobileMenu"
import { getNavLinks } from "../data/navLinks"

const MENU_LABEL = "Menu"
const CLOSE_LABEL = "Fermer"
const CTA_LABEL = "Réserver"

const renderMenu = () =>
  render(<MobileMenu links={getNavLinks()} ctaLabel={CTA_LABEL} menuLabel={MENU_LABEL} closeLabel={CLOSE_LABEL} />)

/** The page burger: while the modal drawer is open it is inert, so query it with `hidden: true`. */
const burger = (): HTMLElement =>
  screen.getAllByRole("button", { name: MENU_LABEL, hidden: true }).find((button) => button.hasAttribute("aria-expanded")) as HTMLElement

const closeButton = (dialog: HTMLElement): HTMLElement => {
  const button = dialog.querySelector<HTMLElement>(`button[aria-label="${CLOSE_LABEL}"]`)
  if (button === null) throw new Error("close control not found")
  return button
}

beforeEach(() => {
  window.location.hash = ""
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("MobileMenu", () => {
  it("closes the drawer when the lg media query starts matching", async () => {
    document.documentElement.style.setProperty("--softn-breakpoint-lg", "64rem")
    let onChange: (() => void) | undefined
    const media = {
      matches: false,
      media: "",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    const matchMedia = vi.fn().mockImplementation((query: string) => {
      if (query !== "(min-width: 64rem)") return { ...media, matches: false }
      return {
        ...media,
        get matches() {
          return media.matches
        },
        addEventListener: (_type: string, listener: () => void) => {
          onChange = listener
        },
      }
    })
    vi.stubGlobal("matchMedia", matchMedia)
    renderMenu()
    expect(matchMedia).toHaveBeenCalledWith("(min-width: 64rem)")
    fireEvent.click(burger())
    await screen.findByRole("dialog", { name: MENU_LABEL })
    media.matches = true
    act(() => onChange?.())
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    document.documentElement.style.removeProperty("--softn-breakpoint-lg")
  })

  it("starts closed with a collapsed burger and no dialog", () => {
    renderMenu()
    expect(burger().getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("opens the labelled drawer with the five links and the CTA", async () => {
    renderMenu()
    fireEvent.click(burger())
    const dialog = await screen.findByRole("dialog", { name: MENU_LABEL })
    expect(burger().getAttribute("aria-expanded")).toBe("true")
    const hrefs = Array.from(dialog.querySelectorAll("nav a")).map((link) => link.getAttribute("href"))
    expect(hrefs).toEqual(["#services", "#methode", "#assistant", "#coulisses", "#faq"])
    dialog.querySelectorAll("nav a").forEach((link) => {
      const label = link.getAttribute("aria-label")
      expect(label).not.toBeNull()
      expect(label?.startsWith(link.textContent ?? "")).toBe(true)
    })
    expect(dialog.querySelector(`a[href="#reservation"]`)?.hasAttribute("aria-label")).toBe(false)
    expect(dialog.querySelector(`a[href="#reservation"]`)?.textContent).toBe(CTA_LABEL)
  })

  it("puts the close control, logo and theme toggle inside the dialog and focuses the close control", async () => {
    renderMenu()
    fireEvent.click(burger())
    const dialog = await screen.findByRole("dialog", { name: MENU_LABEL })
    expect(dialog.querySelector(`a[href="/"]`)).not.toBeNull()
    expect(closeButton(dialog).getAttribute("aria-label")).toBe(CLOSE_LABEL)
    await waitFor(() => expect(document.activeElement).toBe(closeButton(dialog)))
  })

  it("closes when the in-popup close control is pressed", async () => {
    renderMenu()
    fireEvent.click(burger())
    const dialog = await screen.findByRole("dialog")
    fireEvent.click(closeButton(dialog))
    await waitFor(() => expect(burger().getAttribute("aria-expanded")).toBe("false"))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("closes on Escape", async () => {
    renderMenu()
    fireEvent.click(burger())
    const dialog = await screen.findByRole("dialog")
    fireEvent.keyDown(dialog, { key: "Escape" })
    await waitFor(() => expect(burger().getAttribute("aria-expanded")).toBe("false"))
  })

  it("returns focus to the burger after Escape", async () => {
    renderMenu()
    fireEvent.click(burger())
    const dialog = await screen.findByRole("dialog")
    fireEvent.keyDown(dialog, { key: "Escape" })
    await waitFor(() => expect(document.activeElement).toBe(burger()))
  })

  it("closes the drawer then scrolls to the section when a link is activated", async () => {
    renderMenu()
    fireEvent.click(burger())
    const dialog = await screen.findByRole("dialog")
    const link = dialog.querySelector(`a[href="#methode"]`)
    expect(link).not.toBeNull()
    fireEvent.click(link as Element)
    await waitFor(() => expect(burger().getAttribute("aria-expanded")).toBe("false"))
    await waitFor(() => expect(window.location.hash).toBe("#methode"))
  })

  it("closes the drawer then dispatches open-chatbot from the CTA", async () => {
    const received = vi.fn()
    const listener = (event: Event) => {
      event.preventDefault()
      received()
    }
    window.addEventListener(OPEN_CHATBOT_EVENT, listener)
    renderMenu()
    fireEvent.click(burger())
    const dialog = await screen.findByRole("dialog")
    fireEvent.click(dialog.querySelector(`a[href="#reservation"]`) as Element)
    await waitFor(() => expect(received).toHaveBeenCalledTimes(1))
    expect(burger().getAttribute("aria-expanded")).toBe("false")
    expect(window.location.hash).toBe("")
    window.removeEventListener(OPEN_CHATBOT_EVENT, listener)
  })

  it("falls back to #reservation from the CTA when the chatbot does not claim the event", async () => {
    renderMenu()
    fireEvent.click(burger())
    const dialog = await screen.findByRole("dialog")
    fireEvent.click(dialog.querySelector(`a[href="#reservation"]`) as Element)
    await waitFor(() => expect(window.location.hash).toBe("#reservation"))
  })
})
