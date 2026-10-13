// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OPEN_CHATBOT_EVENT } from "@/lib/chatbotEvents"
import { BookingCta } from "../components/BookingCta"

describe("BookingCta", () => {
  const listeners: Array<(event: Event) => void> = []

  beforeEach(() => {
    window.location.hash = ""
  })

  afterEach(() => {
    cleanup()
    for (const listener of listeners.splice(0)) window.removeEventListener(OPEN_CHATBOT_EVENT, listener)
  })

  const listen = (listener: (event: Event) => void): void => {
    listeners.push(listener)
    window.addEventListener(OPEN_CHATBOT_EVENT, listener)
  }

  it("dispatches a cancelable open-chatbot event on click", () => {
    const received = vi.fn()
    listen((event) => received(event.cancelable, (event as CustomEvent).detail))
    render(<BookingCta>Réserver</BookingCta>)
    fireEvent.click(screen.getByRole("link", { name: "Réserver" }))
    expect(received).toHaveBeenCalledWith(true, { source: "header" })
  })

  it("does not scroll to #reservation when the chatbot claims the event", () => {
    listen((event) => event.preventDefault())
    render(<BookingCta>Réserver</BookingCta>)
    fireEvent.click(screen.getByRole("link", { name: "Réserver" }))
    expect(window.location.hash).toBe("")
  })

  it("falls back to #reservation when nobody claims the event", () => {
    render(<BookingCta>Réserver</BookingCta>)
    fireEvent.click(screen.getByRole("link", { name: "Réserver" }))
    expect(window.location.hash).toBe("#reservation")
  })

  it("lets the caller defer the activation", () => {
    const received = vi.fn()
    listen(() => received())
    let deferred: (() => void) | undefined
    render(<BookingCta onBeforeActivate={(activate) => (deferred = activate)}>Réserver</BookingCta>)
    fireEvent.click(screen.getByRole("link", { name: "Réserver" }))
    expect(received).not.toHaveBeenCalled()
    deferred?.()
    expect(received).toHaveBeenCalledTimes(1)
  })
})
