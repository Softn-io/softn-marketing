// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { SECTION_IDS, type SectionId } from '@/lib/anchors'
import { ActiveSectionProvider } from '../context/ActiveSectionContext'
import { SectionLink } from '../SectionLink'
import { getNavLinks } from '../data/navLinks'

type ObserverInstance = {
  callback: IntersectionObserverCallback
  observed: Element[]
  disconnect: Mock<() => void>
}

type ResizeInstance = {
  callback: ResizeObserverCallback
  observed: Element[]
  disconnect: Mock<() => void>
}

let observers: ObserverInstance[] = []
let resizers: ResizeInstance[] = []
let scrollIntoView: Mock<() => void>

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

class FakeResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    const instance: ResizeInstance = { callback, observed: [], disconnect: vi.fn<() => void>() }
    resizers.push(instance)
    this.instance = instance
  }
  instance: ResizeInstance
  observe = (element: Element): void => {
    this.instance.observed.push(element)
  }
  disconnect = (): void => this.instance.disconnect()
  unobserve = (): void => undefined
}

const intersect = (id: string, isIntersecting: boolean): void => {
  const instance = observers.at(-1)
  const target = document.getElementById(id)
  if (instance === undefined || target === null) throw new Error(`no observer or target for ${id}`)
  act(() => {
    instance.callback([{ target, isIntersecting } as unknown as IntersectionObserverEntry], instance as never)
  })
}

/** Delivers the layout pass the resize observer always runs first, and every later layout change with it. */
const resize = (): void => {
  const instance = resizers.at(-1)
  if (instance === undefined) throw new Error('no resize observer')
  act(() => {
    instance.callback([], instance as never)
  })
}

/** Stubs the box jsdom cannot compute: only the top edge is read against the reading band. */
const placeTop = (id: SectionId, top: number): void => {
  const section = document.getElementById(id)
  if (section === null) throw new Error(`no section ${id}`)
  Object.defineProperty(section, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(0, top, 800, 900),
  })
}

/** Opens the page on an in-page link, the way a shared URL does. */
const openOn = (id: SectionId): void => {
  window.history.replaceState(null, '', `/preview#${id}`)
}

const renderNav = (sectionIds: readonly SectionId[]) => {
  sectionIds.forEach((id) => {
    const section = document.createElement('section')
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
    .getAllByRole('link')
    .filter((link) => link.getAttribute('aria-current') === 'location')
    .map((link) => link.getAttribute('href') ?? '')

const ALL = [SECTION_IDS.offers, SECTION_IDS.method, SECTION_IDS.agent, SECTION_IDS.thisSite, SECTION_IDS.faq]

beforeEach(() => {
  observers = []
  resizers = []
  scrollIntoView = vi.fn<() => void>()
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
  vi.useFakeTimers()
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  window.history.replaceState(null, '', '/')
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('active section', () => {
  it('marks no link active at the top of the page', () => {
    renderNav(ALL)
    expect(currentLinks()).toEqual([])
  })

  it('sets aria-current only on the link of the intersecting section', () => {
    renderNav(ALL)
    intersect('methode', true)
    expect(currentLinks()).toEqual(['#methode'])
  })

  it('prefers the last intersecting section in document order', () => {
    renderNav(ALL)
    intersect('methode', true)
    intersect('assistant', true)
    expect(currentLinks()).toEqual(['#assistant'])
    intersect('assistant', false)
    expect(currentLinks()).toEqual(['#methode'])
  })

  it('clears the active link when no section intersects any more', () => {
    renderNav(ALL)
    intersect('services', true)
    intersect('services', false)
    expect(currentLinks()).toEqual([])
  })

  it('ignores sections that are not in the DOM', () => {
    renderNav([SECTION_IDS.offers, SECTION_IDS.faq])
    expect(observers[0]?.observed.map((element) => element.id)).toEqual(['services', 'faq'])
    intersect('faq', true)
    expect(currentLinks()).toEqual(['#faq'])
  })

  it('does not create an observer when no section exists', () => {
    renderNav([])
    expect(observers).toHaveLength(0)
  })

  it('disconnects the observer on unmount', () => {
    const { unmount } = renderNav(ALL)
    unmount()
    expect(observers[0]?.disconnect).toHaveBeenCalledTimes(1)
  })
})

describe('click lock', () => {
  it('activates the clicked link immediately and holds it against intermediate sections', () => {
    renderNav(ALL)
    fireEvent.click(document.querySelector(`a[href="#faq"]`) as Element)
    expect(currentLinks()).toEqual(['#faq'])
    intersect('methode', true)
    intersect('assistant', true)
    expect(currentLinks()).toEqual(['#faq'])
  })

  it('keeps the lock while scroll events keep coming, then releases it after the scroll settles', () => {
    renderNav(ALL)
    fireEvent.click(document.querySelector(`a[href="#faq"]`) as Element)
    intersect('methode', true)
    act(() => {
      vi.advanceTimersByTime(100)
      window.dispatchEvent(new Event('scroll'))
      vi.advanceTimersByTime(100)
    })
    expect(currentLinks()).toEqual(['#faq'])
    intersect('faq', true)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(currentLinks()).toEqual(['#faq'])
    intersect('faq', false)
    expect(currentLinks()).toEqual(['#methode'])
  })

  it('releases the lock when the visitor scrolls by hand', () => {
    renderNav(ALL)
    fireEvent.click(document.querySelector(`a[href="#faq"]`) as Element)
    intersect('services', true)
    act(() => {
      window.dispatchEvent(new Event('wheel'))
    })
    expect(currentLinks()).toEqual(['#services'])
  })

  it('releases the lock after the safety timeout even if scroll never stops', () => {
    renderNav(ALL)
    fireEvent.click(document.querySelector(`a[href="#faq"]`) as Element)
    intersect('services', true)
    for (let elapsed = 0; elapsed < 3200; elapsed += 100) {
      act(() => {
        window.dispatchEvent(new Event('scroll'))
        vi.advanceTimersByTime(100)
      })
    }
    expect(currentLinks()).toEqual(['#services'])
  })

  it('does not lock on a modified click', () => {
    renderNav(ALL)
    fireEvent.click(document.querySelector(`a[href="#faq"]`) as Element, { ctrlKey: true })
    expect(currentLinks()).toEqual([])
  })
})

describe('fragment in the URL', () => {
  it('marks the link of the section the page was opened on active', () => {
    openOn(SECTION_IDS.method)
    renderNav(ALL)
    resize()
    expect(currentLinks()).toEqual(['#methode'])
  })

  it('ignores a fragment that names a section the page does not render', () => {
    openOn(SECTION_IDS.main)
    renderNav(ALL)
    expect(resizers).toHaveLength(0)
    expect(currentLinks()).toEqual([])
  })

  it('holds the fragment section while the anchor scroll crosses other sections, then follows the reader', () => {
    openOn(SECTION_IDS.thisSite)
    renderNav(ALL)
    resize()
    intersect('services', true)
    intersect('methode', true)
    expect(currentLinks()).toEqual(['#coulisses'])
    act(() => {
      vi.advanceTimersByTime(200)
    })
    intersect('assistant', true)
    expect(currentLinks()).toEqual(['#assistant'])
  })

  it('releases the fragment as soon as the visitor scrolls by hand', () => {
    openOn(SECTION_IDS.faq)
    renderNav(ALL)
    resize()
    act(() => {
      window.dispatchEvent(new Event('wheel'))
    })
    intersect('services', true)
    expect(currentLinks()).toEqual(['#services'])
  })

  it('gives way to a link the visitor selects', () => {
    openOn(SECTION_IDS.faq)
    renderNav(ALL)
    resize()
    fireEvent.click(document.querySelector(`a[href="#methode"]`) as Element)
    expect(currentLinks()).toEqual(['#methode'])
    intersect('assistant', true)
    expect(currentLinks()).toEqual(['#methode'])
  })
})

describe('fragment resync', () => {
  it('watches the sections and the document for the layout changes that move the fragment', () => {
    openOn(SECTION_IDS.method)
    renderNav(ALL)
    expect(resizers[0]?.observed).toContain(document.getElementById('methode'))
    expect(resizers[0]?.observed).toContain(document.body)
  })

  it('leaves a fragment that is already at the reading position alone', () => {
    openOn(SECTION_IDS.method)
    renderNav(ALL)
    placeTop(SECTION_IDS.method, 72)
    resize()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('brings the reader back to the fragment section a grown page left behind', () => {
    openOn(SECTION_IDS.method)
    renderNav(ALL)
    // What the method diagram's pinned track does to the page once it hydrates: the section the URL
    // asked for ends up a viewport and a half below the position the browser scrolled to.
    placeTop(SECTION_IDS.method, 1650)
    resize()
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.instances[0]).toBe(document.getElementById('methode'))
  })

  it('keeps resyncing while the visitor has not taken the scroll back', () => {
    openOn(SECTION_IDS.method)
    renderNav(ALL)
    placeTop(SECTION_IDS.method, 72)
    resize()
    placeTop(SECTION_IDS.method, 1650)
    resize()
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('stops resyncing once the visitor takes the scroll back', () => {
    openOn(SECTION_IDS.method)
    renderNav(ALL)
    placeTop(SECTION_IDS.method, 1650)
    act(() => {
      window.dispatchEvent(new Event('wheel'))
    })
    resize()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('resyncs nothing when the page was opened without a fragment', () => {
    renderNav(ALL)
    placeTop(SECTION_IDS.method, 1650)
    expect(resizers).toHaveLength(0)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})

describe('URL fragment sync', () => {
  it('mirrors the active section into the fragment with replaceState', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')
    renderNav(ALL)
    intersect(SECTION_IDS.method, true)
    expect(window.location.hash).toBe(`#${SECTION_IDS.method}`)
    expect(replaceState).toHaveBeenCalledWith(null, '', `/#${SECTION_IDS.method}`)
    replaceState.mockRestore()
  })

  it('never pushes a history entry and never emits a hashchange', () => {
    const pushState = vi.spyOn(window.history, 'pushState')
    const onHashChange = vi.fn()
    window.addEventListener('hashchange', onHashChange)
    renderNav(ALL)
    intersect(SECTION_IDS.offers, true)
    intersect(SECTION_IDS.method, true)
    expect(pushState).not.toHaveBeenCalled()
    expect(onHashChange).not.toHaveBeenCalled()
    window.removeEventListener('hashchange', onHashChange)
    pushState.mockRestore()
  })

  it('keeps the path and the query string', () => {
    window.history.replaceState(null, '', '/preview?x=1')
    renderNav(ALL)
    intersect(SECTION_IDS.faq, true)
    expect(window.location.pathname).toBe('/preview')
    expect(window.location.search).toBe('?x=1')
    expect(window.location.hash).toBe(`#${SECTION_IDS.faq}`)
  })

  it('removes the fragment when no section is active any more', () => {
    renderNav(ALL)
    intersect(SECTION_IDS.offers, true)
    intersect(SECTION_IDS.offers, false)
    expect(window.location.hash).toBe('')
  })

  it('leaves the clicked target in the URL while its click lock is held', () => {
    renderNav(ALL)
    fireEvent.click(document.querySelector(`a[href="#faq"]`) as Element)
    // The fragment navigation the browser runs after the click, which jsdom does not perform itself.
    window.location.hash = SECTION_IDS.faq
    intersect(SECTION_IDS.method, true)
    expect(window.location.hash).toBe(`#${SECTION_IDS.faq}`)
  })

  it('does not write the URL while the page holds the fragment it was opened on', () => {
    openOn(SECTION_IDS.method)
    renderNav(ALL)
    resize()
    intersect(SECTION_IDS.offers, true)
    expect(window.location.hash).toBe(`#${SECTION_IDS.method}`)
  })

  it('matches the settled active section once the hold releases', () => {
    openOn(SECTION_IDS.method)
    renderNav(ALL)
    resize()
    intersect(SECTION_IDS.offers, true)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(window.location.hash).toBe(`#${SECTION_IDS.offers}`)
  })
})
