// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { HERO_CTA_ID } from "@/lib/anchors"
import { ScrollRevealCta } from "../ScrollRevealCta"

type ObserverCallback = (entries: Array<Pick<IntersectionObserverEntry, "isIntersecting" | "boundingClientRect">>) => void

let callback: ObserverCallback | undefined
const disconnect = vi.fn()

const emit = (isIntersecting: boolean, bottom: number): void => {
  act(() => {
    callback?.([{ isIntersecting, boundingClientRect: { bottom } as DOMRectReadOnly }])
  })
}

const mountHeroCta = (): HTMLElement => {
  const hero = document.createElement("a")
  hero.id = HERO_CTA_ID
  document.body.appendChild(hero)
  return hero
}

const renderCta = () =>
  render(
    <ScrollRevealCta>
      <a href="#reservation">Réserver</a>
    </ScrollRevealCta>,
  )

const wrapper = (): HTMLElement => {
  const element = screen.getByRole("link", { name: "Réserver" }).parentElement
  if (element === null) throw new Error("wrapper not found")
  return element
}

beforeEach(() => {
  callback = undefined
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(received: ObserverCallback) {
        callback = received
      }
      observe = vi.fn()
      disconnect = disconnect
    },
  )
})

afterEach(() => {
  cleanup()
  document.getElementById(HERO_CTA_ID)?.remove()
  disconnect.mockClear()
  vi.unstubAllGlobals()
})

describe("ScrollRevealCta", () => {
  it("stays visible when the hero CTA does not exist", () => {
    renderCta()
    expect(wrapper().hasAttribute("inert")).toBe(false)
    expect(wrapper().dataset["state"]).toBe("visible")
    expect(callback).toBeUndefined()
  })

  it("stays visible when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined)
    mountHeroCta()
    renderCta()
    expect(wrapper().hasAttribute("inert")).toBe(false)
  })

  it("is hidden and inert while the hero CTA is in view", () => {
    mountHeroCta()
    renderCta()
    emit(true, 300)
    expect(wrapper().hasAttribute("inert")).toBe(true)
    expect(wrapper().dataset["state"]).toBe("hidden")
  })

  it("stays hidden while the hero CTA is still below the viewport", () => {
    mountHeroCta()
    renderCta()
    emit(false, 1200)
    expect(wrapper().hasAttribute("inert")).toBe(true)
  })

  it("is revealed once the hero CTA has scrolled above the viewport", () => {
    mountHeroCta()
    renderCta()
    emit(true, 300)
    emit(false, -20)
    expect(wrapper().hasAttribute("inert")).toBe(false)
    expect(wrapper().dataset["state"]).toBe("visible")
  })

  it("disconnects the observer on unmount", () => {
    mountHeroCta()
    const { unmount } = renderCta()
    unmount()
    expect(disconnect).toHaveBeenCalledTimes(1)
  })
})
