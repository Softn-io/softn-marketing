// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import { SECTION_IDS, type SectionId } from "@/lib/anchors"
import { ActiveSectionProvider } from "../context/ActiveSectionContext"
import { SectionLink } from "../components/SectionLink"
import { getNavLinks } from "../data/navLinks"

type ObserverInstance = {
  callback: IntersectionObserverCallback
  observed: Element[]
  disconnect: Mock<() => void>
}

let observers: ObserverInstance[] = []

class FakeIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    const instance: ObserverInstance = { callback, observed: [], disconnect: vi.fn<() => void>() }
    observers.push(instance)
    this.instance = instance
  }
  instance: ObserverInstance
  observe = (element: Element): void => {
    this.instance.observed.push(element)
  }
  disconnect = (): void => this.instance.disconnect()
  unobserve = (): void => undefined
  takeRecords = (): IntersectionObserverEntry[] => []
}

const intersect = (id: string, isIntersecting: boolean): void => {
  const instance = observers.at(-1)
  const target = document.getElementById(id)
  if (instance === undefined || target === null) throw new Error(`no observer or target for ${id}`)
  act(() => {
    instance.callback([{ target, isIntersecting } as unknown as IntersectionObserverEntry], instance as never)
  })
}

const renderNav = (sectionIds: readonly SectionId[]) => {
  sectionIds.forEach((id) => {
    const section = document.createElement("section")
    section.id = id
    document.body.appendChild(section)
  })
  const links = getNavLinks()
  return render(
    <ActiveSectionProvider ids={links.map((link) => link.id)}>
      <nav>
        {links.map((link) => (
          <SectionLink key={link.id} link={link} />
        ))}
      </nav>
    </ActiveSectionProvider>,
  )
}

const currentLinks = (): string[] =>
  screen
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "location")
    .map((link) => link.getAttribute("href") ?? "")

const ALL = [SECTION_IDS.offers, SECTION_IDS.method, SECTION_IDS.agent, SECTION_IDS.thisSite, SECTION_IDS.faq]

beforeEach(() => {
  observers = []
  vi.useFakeTimers()
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver)
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ""
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("active section", () => {
  it("marks no link active at the top of the page", () => {
    renderNav(ALL)
    expect(currentLinks()).toEqual([])
  })

  it("sets aria-current only on the link of the intersecting section", () => {
    renderNav(ALL)
    intersect("methode", true)
    expect(currentLinks()).toEqual(["#methode"])
  })

  it("prefers the last intersecting section in document order", () => {
    renderNav(ALL)
    intersect("methode", true)
    intersect("assistant", true)
    expect(currentLinks()).toEqual(["#assistant"])
    intersect("assistant", false)
    expect(currentLinks()).toEqual(["#methode"])
  })

  it("clears the active link when no section intersects any more", () => {
    renderNav(ALL)
    intersect("services", true)
    intersect("services", false)
    expect(currentLinks()).toEqual([])
  })

  it("ignores sections that are not in the DOM", () => {
    renderNav([SECTION_IDS.offers, SECTION_IDS.faq])
    expect(observers[0]?.observed.map((element) => element.id)).toEqual(["services", "faq"])
    intersect("faq", true)
    expect(currentLinks()).toEqual(["#faq"])
  })

  it("does not create an observer when no section exists", () => {
    renderNav([])
    expect(observers).toHaveLength(0)
  })

  it("disconnects the observer on unmount", () => {
    const { unmount } = renderNav(ALL)
    unmount()
    expect(observers[0]?.disconnect).toHaveBeenCalledTimes(1)
  })
})

describe("click lock", () => {
  it("activates the clicked link immediately and holds it against intermediate sections", () => {
    renderNav(ALL)
    fireEvent.click(document.querySelector(`a[href="#faq"]`) as Element)
    expect(currentLinks()).toEqual(["#faq"])
    intersect("methode", true)
    intersect("assistant", true)
    expect(currentLinks()).toEqual(["#faq"])
  })

  it("keeps the lock while scroll events keep coming, then releases it after the scroll settles", () => {
    renderNav(ALL)
    fireEvent.click(document.querySelector(`a[href="#faq"]`) as Element)
    intersect("methode", true)
    act(() => {
      vi.advanceTimersByTime(100)
      window.dispatchEvent(new Event("scroll"))
      vi.advanceTimersByTime(100)
    })
    expect(currentLinks()).toEqual(["#faq"])
    intersect("faq", true)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(currentLinks()).toEqual(["#faq"])
    intersect("faq", false)
    expect(currentLinks()).toEqual(["#methode"])
  })

  it("releases the lock when the visitor scrolls by hand", () => {
    renderNav(ALL)
    fireEvent.click(document.querySelector(`a[href="#faq"]`) as Element)
    intersect("services", true)
    act(() => {
      window.dispatchEvent(new Event("wheel"))
    })
    expect(currentLinks()).toEqual(["#services"])
  })

  it("releases the lock after the safety timeout even if scroll never stops", () => {
    renderNav(ALL)
    fireEvent.click(document.querySelector(`a[href="#faq"]`) as Element)
    intersect("services", true)
    for (let elapsed = 0; elapsed < 3200; elapsed += 100) {
      act(() => {
        window.dispatchEvent(new Event("scroll"))
        vi.advanceTimersByTime(100)
      })
    }
    expect(currentLinks()).toEqual(["#services"])
  })

  it("does not lock on a modified click", () => {
    renderNav(ALL)
    fireEvent.click(document.querySelector(`a[href="#faq"]`) as Element, { ctrlKey: true })
    expect(currentLinks()).toEqual([])
  })
})
