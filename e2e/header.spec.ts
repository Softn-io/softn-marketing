import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { HERO_CTA_ID, type SectionId } from '../lib/anchors'
import { interpolate } from '../lib/interpolate'
import { ASSISTANT_NAME } from '../locales/fr/chatbot'
import { hero, nav } from '../locales/fr/hero'

// Expected copy comes from the locale source, never hardcoded (QA rule for this suite).
const SKIP_LINK = nav.skipLink
const BURGER = nav.menu.ariaLabel
const CLOSE = nav.menu.closeAriaLabel
const MAIN_NAV = nav.ariaLabel
const CTA_LONG = nav.cta
const CTA_SHORT = nav.ctaShort
const LOGO = nav.logo.ariaLabel
const HERO_PRIMARY = hero.cta.primary
const HERO_SECONDARY = hero.cta.secondary
const HERO_INDICATOR = interpolate(hero.agentPrompt, { assistantName: ASSISTANT_NAME })
const AGENT_NAME = interpolate(nav.items.agent, { assistantName: ASSISTANT_NAME })

const NAV_LINKS = [
  { label: nav.items.offers, aria: nav.itemsAria.offers, id: 'services' },
  { label: nav.items.method, aria: nav.itemsAria.method, id: 'methode' },
  {
    label: AGENT_NAME,
    aria: interpolate(nav.itemsAria.agent, { assistantName: ASSISTANT_NAME }),
    id: 'assistant',
  },
  { label: nav.items.thisSite, aria: nav.itemsAria.thisSite, id: 'coulisses' },
  { label: nav.items.faq, aria: nav.itemsAria.faq, id: 'faq' },
]

/**
 * Common prefix of the two theme-toggle accessible names, read off the locale instead of hardcoding
 * French in the suite. Used both as a role-name regex and as an attribute prefix, and passed into
 * `page.evaluate` where the classification runs in the browser.
 */
const TOGGLE_PREFIX = nav.themeToggle.toDark.replace(/\s+\S+$/, '')
const TOGGLE_NAME = new RegExp(TOGGLE_PREFIX)
/** Same locale-derived anchoring for the section links (a prefix, as the accessible name continues). */
const METHOD_NAME = new RegExp(`^${nav.items.method}`)
const BACKSTAGE_NAME = new RegExp(`^${nav.items.thisSite}`)
const FAQ_NAME = new RegExp(`^${nav.items.faq}`)

const DESKTOP = { width: 1280, height: 800 }
const BELOW_LG = { width: 1023, height: 800 }

const header = (page: Page) => page.locator('header')
/** CSS locator: while the drawer is open the header is aria-hidden, so a role query would not find the burger. */
const burger = (page: Page) => page.locator('header button[aria-expanded]')
const drawer = (page: Page) => page.getByRole('dialog', { name: BURGER })
const themeToggle = (page: Page) => page.getByRole('button', { name: TOGGLE_NAME })

/** Accessible name of the element that currently holds focus (aria-label wins over text). */
const focusedName = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement
    if (el === null) return ''
    return el.getAttribute('aria-label') ?? (el as HTMLElement).innerText.trim()
  })

/** Appends one tall section per nav target before hydration so the scroll-spy observes them. */
const injectSections = async (page: Page) => {
  await page.addInitScript(() => {
    const ids = ['services', 'methode', 'assistant', 'coulisses', 'faq']
    document.addEventListener('DOMContentLoaded', () => {
      const wrapper = document.createElement('div')
      wrapper.setAttribute('data-test-sections', '')
      const spacer = document.createElement('div')
      spacer.style.height = '1000px'
      wrapper.append(spacer)
      for (const id of ids) {
        const section = document.createElement('section')
        section.id = id
        section.style.height = '900px'
        section.textContent = id
        wrapper.append(section)
      }
      document.body.append(wrapper)
    })
  })
}

/**
 * Distance between a section's top edge and the reading band's top edge (`scroll-padding-top`), in
 * pixels: zero when the section starts exactly where the reader reads from.
 */
const sectionOffset = (page: Page, id: SectionId): Promise<number> =>
  page.evaluate((sectionId) => {
    const section = document.getElementById(sectionId)
    if (section === null) throw new Error(`section ${sectionId} missing`)
    const padding = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)
    return section.getBoundingClientRect().top - padding
  }, id)

/**
 * Waits until a section really sits at the reading band. The browser applies a fragment in the URL,
 * and every scroll the suite writes, against the layout of that moment: the method diagram's pinned
 * track adds 250vh to the page when it hydrates and the self-hosted fonts swap in after load, so a
 * measurement taken before those shifts lands somewhere else. Polling the section's own box is what
 * makes the wait independent of them.
 */
const expectAtReadingBand = async (page: Page, id: SectionId): Promise<void> => {
  await expect
    .poll(async () => Math.abs(await sectionOffset(page, id)), {
      message: `#${id} must sit at the reading band, not where the pre-hydration layout put it`,
    })
    .toBeLessThanOrEqual(2)
}

/**
 * Scrolls the reader to a section the way the visitor would — a wheel gesture, not a programmatic
 * jump — and waits for the navigation to highlight it. The scroll is retried for the same reason
 * `expectAtReadingBand` waits: the page grows under the reader. The wait is on the highlighted link
 * itself, the product's own state, never on a timer.
 */
const scrollToSection = async (page: Page, id: SectionId): Promise<void> => {
  const viewport = page.viewportSize() ?? { width: 1280, height: 800 }
  await page.mouse.move(viewport.width / 2, viewport.height / 2)
  await expect
    .poll(
      async () => {
        const delta = Math.round(await sectionOffset(page, id))
        if (Math.abs(delta) > 2) await page.mouse.wheel(0, delta)
        return page.evaluate(
          () => document.querySelector("header nav a[aria-current='location']")?.getAttribute('href') ?? null,
        )
      },
      { message: `the reading position must reach #${id} and be highlighted` },
    )
    .toBe(`#${id}`)
}

/**
 * Scrolls the hero CTA fully above the viewport, waits for the header CTA to be revealed, then waits
 * for the `sn-pop` reveal to have **landed** (`opacity: 1`, no `translate`, no `scale`). The reveal
 * runs on `--softn-duration-sheet-drawer` (350 ms) and the wrapper's painted box is scaled during it,
 * so any geometry read straight after the state flip is a mid-animation measurement of a shrunken
 * box; every caller that measures position or edges needs the settled state.
 */
const revealHeaderCta = async (page: Page): Promise<void> => {
  await page.evaluate((id) => {
    const el = document.getElementById(id)
    if (el === null) throw new Error('hero CTA missing')
    window.scrollTo(0, window.scrollY + el.getBoundingClientRect().bottom + 40)
  }, HERO_CTA_ID)
  await expect(page.locator('header [data-state]')).toHaveAttribute('data-state', 'visible')
  await expect
    .poll(
      () =>
        page.locator('header [data-state]').evaluate((el) => {
          const style = getComputedStyle(el)
          return `${style.opacity}|${style.translate}|${style.scale}`
        }),
      { message: 'the sn-pop reveal must settle at rest: opaque, unoffset, unscaled' },
    )
    .toBe('1|none|none')
}

/**
 * Right edge of the header's content (the header's border-box right minus its inline padding) and
 * the horizontal boxes of the theme toggle and the booking CTA. While the CTA is hidden it is out of
 * flow and takes no space, so the toggle must sit exactly on the content right edge; revealed, the
 * CTA takes that edge and the toggle returns to its left.
 */
type HeaderBoxes = {
  contentRight: number
  toggle: { left: number; right: number }
  cta: { left: number; right: number } | null
}
const headerBoxes = (page: Page): Promise<HeaderBoxes> =>
  page.evaluate((toggleSelector) => {
    const header = document.querySelector('header')
    if (header === null) throw new Error('header missing')
    const rect = header.getBoundingClientRect()
    const contentRight = rect.right - Number.parseFloat(getComputedStyle(header).paddingRight)
    const box = (selector: string) => {
      const el = document.querySelector(selector)
      if (el === null) return null
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right }
    }
    return {
      contentRight,
      toggle: box(toggleSelector) ?? { left: Number.NaN, right: Number.NaN },
      cta: box("header a[href='#reservation']"),
    }
  }, `header button[aria-label^='${TOGGLE_PREFIX}']`)

test.describe('header: desktop', () => {
  test.use({ viewport: DESKTOP })

  test('landmarks: one banner, labelled nav, main target of the skip link', async ({ page }) => {
    await page.goto('/preview')
    await expect(page.getByRole('banner')).toHaveCount(1)
    await expect(page.getByRole('navigation', { name: MAIN_NAV })).toBeVisible()
    await expect(page.locator('main#main')).toHaveCount(1)
    await expect(burger(page)).toBeHidden()
  })

  test('skip link is the first Tab stop, becomes visible and targets #main', async ({ page }) => {
    await page.goto('/preview')
    const skip = page.getByRole('link', { name: SKIP_LINK })
    await expect(skip).toHaveAttribute('href', '#main')
    // The skip link sits fully above the viewport until it receives focus.
    expect((await skip.boundingBox())?.y ?? 0).toBeLessThan(0)
    await page.keyboard.press('Tab')
    await expect(skip).toBeFocused()
    const box = await skip.boundingBox()
    expect(box).not.toBeNull()
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#main$/)
  })

  test('Tab order: skip link, logo, five nav links, theme toggle, then the hero links while the header CTA is hidden', async ({
    page,
  }) => {
    await page.goto('/preview')
    // The wrapper ships `data-state="hidden"` in the server HTML (ScrollRevealCta, PR #75 review) and
    // the client adds `inert` right after hydration: the header CTA is out of the tab order and out
    // of the accessibility tree from the first frame (`visibility: hidden` does that on its own) —
    // there is no visible pre-hydration state to settle away from any more. The ninth stop is
    // therefore the hero's primary call to action.
    await expect(page.locator('header [data-state]')).toHaveAttribute('data-state', 'hidden')
    await expect(page.getByRole('link', { name: CTA_LONG })).toHaveCount(0)
    const names: string[] = []
    for (let i = 0; i < 11; i += 1) {
      await page.keyboard.press('Tab')
      names.push(await focusedName(page))
    }
    expect(names[0]).toBe(SKIP_LINK)
    expect(names[1]).toBe(LOGO)
    NAV_LINKS.forEach((link, i) => {
      expect(names[2 + i]).toContain(link.label)
    })
    expect(names[7]).toMatch(TOGGLE_NAME)
    // Since #10 the header CTA wrapper is inert while the hero CTA is on screen (ScrollRevealCta):
    // the ninth stop is the hero's primary call to action, then its secondary and the scroll indicator.
    expect(names[8]).toBe(HERO_PRIMARY)
    expect(names[9]).toBe(HERO_SECONDARY)
    expect(names[10]).toBe(HERO_INDICATOR)
  })

  test('nav accessible names start with the visible text (WCAG 2.5.3)', async ({ page }) => {
    await page.goto('/preview')
    const links = page.getByRole('navigation', { name: MAIN_NAV }).getByRole('link')
    await expect(links).toHaveCount(5)
    for (let i = 0; i < 5; i += 1) {
      const link = links.nth(i)
      const visible = ((await link.textContent()) ?? '').trim()
      const name = (await link.getAttribute('aria-label')) ?? ''
      expect(visible.length).toBeGreaterThan(0)
      expect(name.startsWith(visible)).toBe(true)
    }
  })

  test('focus is visibly ringed on logo, nav link and the CTAs', async ({ page }) => {
    await page.goto('/preview')
    // Tab stops at the top of the page: skip link, logo, 5 nav links, theme toggle, then the hero's
    // primary CTA — the header CTA ships hidden in the server render and the client adds `inert`
    // after hydration (ScrollRevealCta), so it is not the ninth stop until the hero CTA has scrolled
    // out of view; its ring is covered after the reveal in
    // `header: CTA starts hidden in the server render`.
    const expected = new Map<number, string>([
      [2, 'logo'],
      [3, 'nav link'],
      [9, 'hero primary CTA'],
    ])
    for (let stop = 1; stop <= 9; stop += 1) {
      await page.keyboard.press('Tab')
      const label = expected.get(stop)
      if (label === undefined) continue
      if (stop === 9) expect(await focusedName(page)).toBe(HERO_PRIMARY)
      const ring = await page.evaluate(() => {
        const style = getComputedStyle(document.activeElement as Element)
        return {
          outlineStyle: style.outlineStyle,
          outlineWidth: Number.parseFloat(style.outlineWidth),
          boxShadow: style.boxShadow,
        }
      })
      const hasRing = (ring.outlineStyle !== 'none' && ring.outlineWidth > 0) || ring.boxShadow !== 'none'
      expect(hasRing, `${label}: no focus ring ${JSON.stringify(ring)}`).toBe(true)
    }
  })

  test('header stays stuck to the top while scrolling', async ({ page }) => {
    await injectSections(page)
    await page.goto('/preview')
    await page.evaluate(() => window.scrollTo(0, 1500))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000)
    const top = await header(page).evaluate((el) => el.getBoundingClientRect().top)
    expect(top).toBe(0)
    await expect(page.getByRole('link', { name: CTA_LONG })).toBeVisible()
  })

  test('header CTA stays hidden and inert while the hero CTA is on screen, reveals once it scrolls out of view', async ({
    page,
  }) => {
    await injectSections(page)
    await page.goto('/preview')
    const wrapper = page.locator('header [data-state]')
    const heroCta = page.locator(`#${HERO_CTA_ID}`)
    // The hero CTA is on screen: ScrollRevealCta hides its wrapper, so the page never shows two CTAs at once.
    await expect(heroCta).toBeVisible()
    await expect(wrapper).toHaveAttribute('data-state', 'hidden')
    await expect(wrapper).toHaveJSProperty('inert', true)
    await expect(page.locator("header a[href='#reservation']")).toBeHidden()
    // Scrolling the hero CTA fully above the viewport reveals the header CTA again.
    await page.evaluate((id) => {
      const el = document.getElementById(id)
      if (el === null) throw new Error('hero CTA missing')
      window.scrollTo(0, window.scrollY + el.getBoundingClientRect().bottom + 40)
    }, HERO_CTA_ID)
    await expect(wrapper).toHaveAttribute('data-state', 'visible')
    await expect(wrapper).toHaveJSProperty('inert', false)
    await expect(page.getByRole('link', { name: CTA_LONG })).toBeVisible()
  })

  test('revealed header CTA click dispatches no listener, does not throw and sets #reservation', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await injectSections(page)
    await page.goto('/preview')
    // The self-hosted fonts swap after load and move every text block: measure the hero CTA
    // against the settled layout (the same swap moves the sections the scroll-spy reads).
    await page.evaluate(() => document.fonts.ready)
    // The header CTA is only clickable once the hero CTA has scrolled out of view (ScrollRevealCta).
    await expect(page.locator('header [data-state]')).toHaveAttribute('data-state', 'hidden')
    await page.evaluate((id) => {
      const el = document.getElementById(id)
      if (el === null) throw new Error('hero CTA missing')
      window.scrollTo(0, window.scrollY + el.getBoundingClientRect().bottom + 40)
    }, HERO_CTA_ID)
    await expect(page.locator('header [data-state]')).toHaveAttribute('data-state', 'visible')
    await page.getByRole('link', { name: CTA_LONG }).click()
    await expect(page).toHaveURL(/#reservation$/)
    expect(errors).toEqual([])
  })

  test('in-page links update the URL hash and mark the target section active', async ({ page }) => {
    await injectSections(page)
    await page.goto('/preview')
    const nav = page.getByRole('navigation', { name: MAIN_NAV })
    await expect(nav.locator('[aria-current]')).toHaveCount(0)
    await nav.getByRole('link', { name: METHOD_NAME }).click()
    await expect(page).toHaveURL(/#methode$/)
    await expect(nav.getByRole('link', { name: METHOD_NAME })).toHaveAttribute('aria-current', 'location')
    await expect(nav.locator('[aria-current]')).toHaveCount(1)
  })

  test('scrolling moves the active link with the reading position', async ({ page }) => {
    await injectSections(page)
    await page.goto('/preview')
    const nav = page.getByRole('navigation', { name: MAIN_NAV })
    // The scroll is written against the settled layout and the wait is on the highlighted link, so a
    // page that grew mid-scroll (the method diagram hydrating) is retried rather than sampled.
    await scrollToSection(page, 'coulisses')
    await expect(nav.getByRole('link', { name: BACKSTAGE_NAME })).toHaveAttribute('aria-current', 'location')
    await expect(nav.locator('[aria-current]')).toHaveCount(1)
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(nav.locator('[aria-current]')).toHaveCount(0)
  })

  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`a fragment in the URL marks its section active and brings the reader to it (${reducedMotion})`, async ({
      page,
    }) => {
      await injectSections(page)
      await page.emulateMedia({ reducedMotion })
      await page.goto('/preview#assistant')
      const nav = page.getByRole('navigation', { name: MAIN_NAV })
      await expect(nav.getByRole('link', { name: AGENT_NAME })).toHaveAttribute('aria-current', 'location')
      await expect(nav.locator('[aria-current]')).toHaveCount(1)
      // The browser applied the fragment against the pre-hydration layout; the reader must still end
      // up on the section the link asked for, not 250vh short of it.
      await expectAtReadingBand(page, 'assistant')
      // And from there the spy follows the reader like it does without a fragment.
      await scrollToSection(page, 'coulisses')
      await expect(nav.getByRole('link', { name: BACKSTAGE_NAME })).toHaveAttribute('aria-current', 'location')
      await expect(nav.locator('[aria-current]')).toHaveCount(1)
    })
  }
})

test.describe('header: single CTA label per breakpoint', () => {
  /*
   * Since the PR #75 review the wrapper ships hidden in the server render (`inert` follows client-side
   * right after hydration), so the booking link is not reachable by any role query at the top of the
   * page; the label contract is read once the hero CTA has scrolled out of view and the header CTA is
   * revealed (same scroll recipe as the reveal tests above).
   */
  test('1279 shows the short label only, 1280 the long one only', async ({ page }) => {
    await injectSections(page)
    await page.setViewportSize({ width: 1279, height: 800 })
    await page.goto('/preview')
    // Hidden start: the CTA is neither visible nor in the accessibility tree at the top of the page.
    await expect(page.locator('header [data-state]')).toHaveAttribute('data-state', 'hidden')
    await expect(page.getByRole('link', { name: CTA_SHORT, exact: true })).toHaveCount(0)
    await revealHeaderCta(page)
    await expect(page.getByRole('link', { name: CTA_SHORT, exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: CTA_LONG })).toHaveCount(0)
    await expect(page.locator("header a[href='#reservation']")).toHaveCount(1)

    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(page.getByRole('link', { name: CTA_LONG })).toBeVisible()
    await expect(page.getByRole('link', { name: CTA_SHORT, exact: true })).toHaveCount(0)
  })
})

test.describe('header: CTA starts hidden in the server render (PR #75 review)', () => {
  test.use({ viewport: DESKTOP })

  /*
   * The contract from Mel's review: hidden is the server state — the HTML ships `data-state="hidden"`
   * and **no** `inert` (D-1: no CSS can lift an attribute, and the `scripting: none` override has to
   * show an operable CTA), so no frame ever paints the header CTA at the top of the page; the client
   * adds `inert` after hydration as belt and braces on top of `visibility: hidden`. While hidden the
   * wrapper is out of flow and takes no space, which puts the theme toggle exactly on the header's
   * content right edge; the CTA appears only once the hero CTA has scrolled above the viewport,
   * becomes focusable, moves the toggle to its left, and disappears again on the way back up.
   * Without JavaScript the `scripting: none` override shows the CTA on its own.
   */
  test('a hard reload at the top never paints the header CTA: the server HTML ships it hidden, without inert', async ({
    page,
  }) => {
    const problems: string[] = []
    page.on('console', (message) => {
      // Chromium on Linux logs a parse warning for Permissions-Policy features it does not
      // recognize; browser noise, not page noise.
      if (/^Error with Permissions-Policy header:/.test(message.text())) return
      if (message.type() === 'error' || message.type() === 'warning')
        problems.push(`${message.type()}: ${message.text()}`)
    })
    // Per-frame recorder installed before any page script: samples what is painted from the first
    // frame of the load. A pre-hydration flash would show up as `visible` samples.
    await page.addInitScript(() => {
      type Sample = { state: string | null; visibility: string; opacity: string }
      const samples: Sample[] = []
      Reflect.set(window, '__ctaSamples', samples)
      const tick = () => {
        const el = document.querySelector('header [data-state]')
        if (el !== null) {
          const style = getComputedStyle(el)
          samples.push({ state: el.getAttribute('data-state'), visibility: style.visibility, opacity: style.opacity })
        }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    // `commit`: goto resolves as soon as the navigation is committed, before scripts and paint, so
    // the recorder covers the whole hydration window.
    const response = await page.goto('/preview', { waitUntil: 'commit' })
    if (response === null) throw new Error('navigation returned no response')
    const html = await response.text()
    // The hidden state is in the markup itself, not written by a script after the fact. CSS-module
    // class names are hashed in production builds, so the wrapper is picked out by its `data-state`
    // attribute, which the component writes un-hashed.
    expect(html).toContain('data-state="hidden"')
    // No `inert` in the server markup (this assertion used to require it — that encoded defect D-1):
    // no CSS can lift an attribute, and the `@media (scripting: none)` override must be able to show
    // a fully operable CTA without any script. Checked on the wrapper's own opening tag, so the
    // inlined React flight payload can neither produce a false match nor a false pass.
    const wrapperTags = html.match(/<div[^>]*data-state="hidden"[^>]*>/g) ?? []
    expect(wrapperTags.length, 'the served HTML carries the hidden wrapper').toBeGreaterThan(0)
    for (const tag of wrapperTags) expect(tag, `served wrapper opening tag: ${tag}`).not.toMatch(/inert/)

    // Sample across the full reveal window (1.31 s) plus hydration: every frame must paint nothing.
    // The wait is the *sampling window*, not a settle signal: the assertions below read the frames.
    await page.waitForTimeout(1600)
    const samples = await page.evaluate(
      () => Reflect.get(window, '__ctaSamples') as Array<{ state: string | null; visibility: string; opacity: string }>,
    )
    expect(samples.length, 'animation frames sampled during load').toBeGreaterThanOrEqual(10)
    for (const [frame, sample] of samples.entries()) {
      expect(sample.state, `frame ${String(frame)}: data-state`).toBe('hidden')
      expect(sample.visibility, `frame ${String(frame)}: nothing is painted`).toBe('hidden')
      expect(sample.opacity, `frame ${String(frame)}: fully transparent`).toBe('0')
    }

    // With JavaScript on, the client adds the belt-and-braces `inert` to the wrapper it hydrates in
    // the hidden state (`isScripted && !isRevealed`, ScrollRevealCta): the attribute is absent from
    // the served markup above, and present here, once hydration has swapped in the client snapshot.
    const wrapper = page.locator('header [data-state]')
    await expect(wrapper, 'the hydrated hidden wrapper is inert').toHaveJSProperty('inert', true)
    expect(
      await wrapper.evaluate((el) => el.hasAttribute('inert')),
      'the hydrated hidden wrapper carries the inert attribute',
    ).toBe(true)
    await expect(wrapper).toHaveCSS('visibility', 'hidden')
    await expect(wrapper).toHaveCSS('opacity', '0')

    // And it is not operable while hidden: focus() on the inert, visibility-hidden link is refused
    // by Chromium (the client-side `inert` plus `visibility: hidden`, not the server markup).
    const focusLanded = await page.evaluate(() => {
      const link = document.querySelector("header a[href='#reservation']") as HTMLElement | null
      if (link === null) throw new Error('header CTA link missing')
      link.focus()
      return document.activeElement === link
    })
    expect(focusLanded, 'the hidden header CTA must not take focus').toBe(false)

    expect(problems, `console noise during load: ${problems.join(' | ')}`).toEqual([])
  })

  for (const width of [1024, 1280]) {
    test(`the theme toggle sits flush on the content right edge at ${width}px while the CTA is hidden`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/preview')
      await expect(page.locator('header [data-state]')).toHaveAttribute('data-state', 'hidden')
      const boxes = await headerBoxes(page)
      expect(
        Math.abs(boxes.toggle.right - boxes.contentRight),
        `toggle.right ${String(boxes.toggle.right)} vs content right ${String(boxes.contentRight)}`,
      ).toBeLessThanOrEqual(1)
      // Out of flow, fully collapsed: absolute, invisible, transparent — and anchored exactly where
      // the reveal lands. Since the PR #75 review the hidden state also carries the *start* of the
      // `sn-pop` drop-in: `translate: 0 calc(-1 * var(--softn-space-2))` (8 px above rest) and
      // `scale: var(--softn-motion-scale-from)` (0.96), read here with JavaScript on. The D-2 fix must
      // cancel both in the no-JS override only, never here.
      const hidden = await page.locator('header [data-state]').evaluate((el) => {
        const style = getComputedStyle(el)
        const rect = el.getBoundingClientRect()
        return {
          position: style.position,
          visibility: style.visibility,
          opacity: style.opacity,
          translate: style.translate,
          scale: style.scale,
          left: rect.left,
          right: rect.right,
          width: rect.width,
        }
      })
      expect(hidden.position, 'the hidden wrapper leaves the flow').toBe('absolute')
      expect(hidden.visibility).toBe('hidden')
      expect(hidden.opacity).toBe('0')
      expect(hidden.translate, 'the JS hidden state holds the 8 px drop-in start (above rest)').toBe('0px -8px')
      // `--softn-motion-scale-from` resolves to 0.96: the mockup's 0.94 is the accepted deviation
      // (Mel's decision, tokens 0.3.0 — the published scale step is used instead of a literal).
      expect(hidden.scale, 'the JS hidden state holds the sn-pop scale start').toBe('0.96')
      // The painted rect is the *scaled* box, so its right edge sits inside the anchor by half the
      // shortfall. Undo the transform (same centre, width divided by the scale) to compare the
      // untransformed anchor with the content right edge: that is where the reveal lands.
      const scale = Number.parseFloat(hidden.scale)
      expect(Number.isNaN(scale), 'the hidden scale parses').toBe(false)
      const anchorRight = (hidden.left + hidden.right) / 2 + hidden.width / scale / 2
      expect(
        Math.abs(anchorRight - boxes.contentRight),
        `hidden anchor right ${String(anchorRight)} vs content right ${String(boxes.contentRight)}`,
      ).toBeLessThanOrEqual(1)
      // …and the painted edge really is the inset one (the effect the review warns about): the
      // shortfall is half the lost width, on the right because the transform origin is the centre.
      expect(
        boxes.contentRight - hidden.right,
        `painted edge inset by the scale: ${String(boxes.contentRight - hidden.right)} px`,
      ).toBeGreaterThan(1)
      expect(
        Math.abs(boxes.contentRight - hidden.right - (hidden.width / scale - hidden.width) / 2),
        'the inset equals half the scaled-off width',
      ).toBeLessThanOrEqual(1)
    })
  }

  test('after scrolling past the hero CTA the header CTA is visible, keyboard focusable with a ring, and the toggle sits to its left', async ({
    page,
  }) => {
    await injectSections(page)
    await page.goto('/preview')
    await revealHeaderCta(page)
    const ctaLink = page.getByRole('link', { name: CTA_LONG })
    await expect(ctaLink).toBeVisible()
    await expect(page.locator('header [data-state]')).toHaveJSProperty('inert', false)
    // Keyboard: nine stops reach it (skip link, logo, five nav links, theme toggle, header CTA).
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    for (let stop = 1; stop <= 9; stop += 1) await page.keyboard.press('Tab')
    await expect(ctaLink).toBeFocused()
    const ring = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement as Element)
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
        boxShadow: style.boxShadow,
      }
    })
    const hasRing = (ring.outlineStyle !== 'none' && ring.outlineWidth > 0) || ring.boxShadow !== 'none'
    expect(hasRing, `no focus ring on the revealed header CTA ${JSON.stringify(ring)}`).toBe(true)
    // Geometry: the CTA takes the content right edge and the toggle returns to its left, one
    // `gap-3` (space-3 = 12 px) away.
    const boxes = await headerBoxes(page)
    if (boxes.cta === null) throw new Error('revealed header CTA has no box')
    expect(Math.abs(boxes.cta.right - boxes.contentRight), 'CTA on the content right edge').toBeLessThanOrEqual(1)
    expect(
      Math.abs(boxes.cta.left - boxes.toggle.right - 12),
      `gap toggle→CTA ${String(boxes.cta.left - boxes.toggle.right)}`,
    ).toBeLessThanOrEqual(1)
  })

  test('scrolling back to the top hides the CTA again and puts the toggle back on the edge', async ({ page }) => {
    await injectSections(page)
    await page.goto('/preview')
    await revealHeaderCta(page)
    await page.evaluate(() => window.scrollTo(0, 0))
    const wrapper = page.locator('header [data-state]')
    await expect(wrapper).toHaveAttribute('data-state', 'hidden')
    await expect(wrapper).toHaveJSProperty('inert', true)
    await expect(wrapper).toHaveCSS('visibility', 'hidden')
    // Out of the accessibility tree and out of the tab order again.
    await expect(page.getByRole('link', { name: CTA_LONG })).toHaveCount(0)
    const boxes = await headerBoxes(page)
    expect(
      Math.abs(boxes.toggle.right - boxes.contentRight),
      'the toggle returns to the content right edge',
    ).toBeLessThanOrEqual(1)
  })

  test('reduced motion: the CTA still starts hidden and revealed, and its reveal is a plain fade with no movement at all', async ({
    page,
  }) => {
    await injectSections(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/preview')
    // The preference changes timings, never the semantics: hidden out of flow at the top.
    await expect(page.locator('header [data-state]')).toHaveAttribute('data-state', 'hidden')
    await expect(page.locator('header [data-state]')).toHaveCSS('position', 'absolute')
    await expect(page.locator('header [data-state]')).toHaveCSS('visibility', 'hidden')
    // The sn-pop start values are cancelled, not just un-transitioned: the reduced-motion block resets
    // `--scroll-reveal-translate` and `--scroll-reveal-scale` to `none` on the hidden state itself, so
    // the CTA never carries the 8 px offset or the 0.96 scale, not even on the frame it starts.
    const hiddenState = await page.locator('header [data-state]').evaluate((el) => {
      const style = getComputedStyle(el)
      return {
        translate: style.translate,
        scale: style.scale,
        customTranslate: style.getPropertyValue('--scroll-reveal-translate').trim(),
        customScale: style.getPropertyValue('--scroll-reveal-scale').trim(),
        paintedWidth: el.getBoundingClientRect().width,
        layoutWidth: (el as HTMLElement).offsetWidth,
      }
    })
    expect(hiddenState.translate, 'reduced motion: no drop-in offset on the hidden state').toBe('none')
    expect(hiddenState.scale, 'reduced motion: no scale on the hidden state').toBe('none')
    expect(hiddenState.customTranslate).toBe('none')
    expect(hiddenState.customScale).toBe('none')
    // With no scale applied, the painted box is exactly the layout box (regression guard: a leaking
    // 0.96 would shrink it by 4 %).
    expect(
      Math.abs(hiddenState.paintedWidth - hiddenState.layoutWidth),
      `reduced motion: painted ${String(hiddenState.paintedWidth)} vs layout ${String(hiddenState.layoutWidth)}`,
    ).toBeLessThanOrEqual(1)
    await revealHeaderCta(page)
    await expect(page.getByRole('link', { name: CTA_LONG })).toBeVisible()
    // No movement is transitioned: the reduced-motion block keeps only `opacity` and `visibility`, at
    // the reduced duration token (150 ms) — neither `translate`, `scale` nor `transform`.
    const transition = await page.locator('header [data-state]').evaluate((el) => {
      const style = getComputedStyle(el)
      return { property: style.transitionProperty, duration: style.transitionDuration }
    })
    expect(transition.property).not.toContain('translate')
    expect(transition.property).not.toContain('transform')
    expect(transition.property).not.toContain('scale')
    expect(transition.property).toContain('opacity')
    expect(transition.duration.split(',')[0]?.trim(), `reduced reveal duration ${transition.duration}`).toBe('0.15s')
    // And the revealed state is at rest: no offset, no scale, exactly the geometry of the animated
    // build (the fade is the whole appearance).
    const revealed = await page.locator('header [data-state]').evaluate((el) => {
      const style = getComputedStyle(el)
      return { translate: style.translate, scale: style.scale, transform: style.transform }
    })
    expect(revealed.translate).toBe('none')
    expect(revealed.scale).toBe('none')
    expect(revealed.transform).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/)
  })

  /*
   * The animation contract of the PR #75 review, sampled frame by frame: the reveal is the mockup's
   * `sn-pop` drop-in — it starts **above** rest (8 px, `--softn-space-2`), scaled down (0.96,
   * `--softn-motion-scale-from`) and transparent, and lands at rest over `--softn-duration-sheet-drawer`
   * (350 ms) with `--softn-easing-out`. Mel's accepted deviations from the mockup stay as they are: the
   * mockup uses `translateY(-10px) scale(.94)` over 460 ms, the site uses the nearest published tokens.
   * Sampling the painted frames is the only way to prove the *start* of the movement: the settled state
   * alone would also be reached by a plain fade.
   */
  test('the reveal is the sn-pop drop-in: above rest, scaled and transparent at the start, at rest when it lands', async ({
    page,
  }) => {
    type Frame = { state: string; opacity: number; translate: string; scale: number; top: number }
    await injectSections(page)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/preview')
    const wrapper = page.locator('header [data-state]')
    await expect(wrapper).toHaveAttribute('data-state', 'hidden')
    // Per-frame recorder: samples the wrapper's painted state every frame from here on.
    await page.evaluate(() => {
      const frames: Array<{
        state: string
        opacity: number
        translate: string
        scale: number
        top: number
      }> = []
      Reflect.set(window, '__revealFrames', frames)
      const tick = (): void => {
        const el = document.querySelector('header [data-state]')
        if (el !== null) {
          const style = getComputedStyle(el)
          frames.push({
            state: el.getAttribute('data-state') ?? '',
            opacity: Number.parseFloat(style.opacity),
            translate: style.translate,
            scale: style.scale === 'none' ? 1 : Number.parseFloat(style.scale),
            top: el.getBoundingClientRect().top,
          })
        }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })

    await revealHeaderCta(page)

    // The transition of the revealed rule: the three sn-pop properties at the sheet-drawer token.
    const timings = await wrapper.evaluate((el) => {
      const style = getComputedStyle(el)
      return {
        duration: style.transitionDuration,
        easing: style.transitionTimingFunction,
        property: style.transitionProperty,
      }
    })
    expect(timings.property, 'the reveal transitions opacity, translate and scale').toContain('translate')
    expect(timings.property).toContain('scale')
    expect(timings.duration, 'sn-pop duration is the sheet-drawer token on all three properties').toBe(
      '0.35s, 0.35s, 0.35s, 0s',
    )
    expect(timings.easing, 'the easing is the out token').toContain('cubic-bezier(0, 0, 0.2, 1)')

    // Rest geometry, measured after the reveal has settled (the helper above waits for it).
    const rest = await wrapper.evaluate((el) => {
      const box = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      return { top: box.top, translate: style.translate, scale: style.scale, opacity: style.opacity }
    })
    expect(rest.opacity, 'settled reveal is fully opaque').toBe('1')
    expect(rest.translate, 'settled reveal carries no offset').toBe('none')
    expect(rest.scale, 'settled reveal carries no scale').toBe('none')

    const frames = (await page.evaluate(() => Reflect.get(window, '__revealFrames'))) as Frame[]
    const paint = frames.filter((frame) => frame.state === 'visible')
    expect(paint.length, 'visible frames sampled during the reveal').toBeGreaterThanOrEqual(4)
    const first = paint[0]
    expect(first, 'the recorder caught the first painted frame').toBeTruthy()
    if (first) {
      // The three acceptance criteria of the drop-in, on the first frame that paints the CTA. The
      // frame is sampled *after* the transition has started, so the offset is somewhere inside the
      // declared start: above rest by at most the 8 px of `--softn-space-2` (the exact start value is
      // pinned on the hidden state in the test above).
      expect(first.opacity, 'first painted frame is transparent').toBeLessThan(1)
      expect(first.scale, 'first painted frame is scaled down').toBeLessThan(1)
      expect(first.top, 'first painted frame starts above the resting position').toBeLessThan(rest.top)
      const offset = Number.parseFloat(/^\d+px (-[\d.]+)px$/.exec(first.translate)?.[1] ?? 'NaN')
      expect(Number.isNaN(offset), `first painted frame carries a rise offset (${first.translate})`).toBe(false)
      expect(offset, `drop-in offset stays within the 8 px token step: ${first.translate}`).toBeLessThan(0)
      expect(
        offset,
        `drop-in offset starts at most one --softn-space-2 above rest: ${first.translate}`,
      ).toBeGreaterThanOrEqual(-8)
    }
    // The movement is monotonic towards rest and never overshoots: it comes from above (top grows to
    // the resting top) and the scale only increases towards 1.
    for (const [index, frame] of paint.entries()) {
      expect(frame.scale, `frame ${String(index)}: scale stays at or under 1`).toBeLessThanOrEqual(1.001)
      expect(frame.opacity, `frame ${String(index)}: opacity stays at or under 1`).toBeLessThanOrEqual(1.001)
      if (index === 0) continue
      const previous = paint[index - 1]
      if (previous === undefined) continue
      expect(frame.top, `frame ${String(index)}: the box moves down towards rest`).toBeGreaterThanOrEqual(
        previous.top - 0.5,
      )
      expect(frame.scale, `frame ${String(index)}: the scale grows towards rest`).toBeGreaterThanOrEqual(
        previous.scale - 0.001,
      )
    }
    expect(paint.at(-1)?.top, 'the last sampled frame has landed at rest').toBeCloseTo(rest.top, 0)
  })
})

test.describe('header: CTA without JavaScript', () => {
  /*
   * Mel's PR #75 decision: "without JavaScript the CTA is shown via `@media (scripting: none)`" — and
   * shown means laid out like the revealed state and operable: the component contract
   * (`BookingCta.tsx`: "Without JavaScript it is a plain `#reservation` link") is the baseline. This
   * is the acceptance surface of the D-1 (no `inert` in the server markup) and D-2 (the no-JS rise
   * reset survives the build) fixes; three separate tests so one run exposes every aspect at once.
   */
  const atDesktopWidth = async (browser: Browser, width: number, label: string, exact: boolean) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 800 } })
    const page = await context.newPage()
    await page.goto('/preview')
    // The wrapper itself: nothing runs to flip `data-state`, so the CSS override carries the whole
    // reveal. The `translate` / `scale` checks are the D-2 regression guard, extended to the sn-pop
    // scale: the drop-in start values live in `--scroll-reveal-translate` and `--scroll-reveal-scale`,
    // which the override resets to `none` through a `var()` (opaque to Lightning CSS, which used to
    // drop a literal `translate: none` and leak the offset).
    const wrapper = page.locator('header [data-state]')
    await expect(wrapper).toHaveAttribute('data-state', 'hidden')
    await expect(wrapper).toHaveCSS('position', 'static')
    await expect(wrapper).toHaveCSS('visibility', 'visible')
    await expect(wrapper).toHaveCSS('opacity', '1')
    // `none` or the identity matrix: Lightning CSS serializes the source's `transform: none` as
    // `translate(0,0)` in the build, so the computed value is the identity — either spelling means
    // "no transform", which is the contract.
    await expect(wrapper).toHaveCSS('transform', /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/)
    // The CTA must sit where the revealed state puts it: `translate` must be a no-offset value.
    // A leaking `0px -8px` (the hidden drop-in start) paints the button 8 px above its row.
    await expect(wrapper).toHaveCSS('translate', /^(none|matrix\(1, 0, 0, 1, 0, 0\)|0px 0px)$/)
    // And unscaled: a leaking `0.96` would shrink the painted box by 4 % of its width.
    await expect(wrapper).toHaveCSS('scale', /^(none|1)$/)
    // The label contract still holds in this state.
    await expect(page.getByRole('link', { name: label, exact })).toBeVisible()
    // Record the measured no-JS values in the report: this is the surface where D-2 lived, so the
    // evidence that the built CSS carries the reset should be readable, not just "green".
    const measured = await wrapper.evaluate((el) => {
      const style = getComputedStyle(el)
      const box = el.getBoundingClientRect()
      return {
        position: style.position,
        visibility: style.visibility,
        opacity: style.opacity,
        translate: style.translate,
        scale: style.scale,
        transform: style.transform,
        customProperty: style.getPropertyValue('--scroll-reveal-translate').trim(),
        customScale: style.getPropertyValue('--scroll-reveal-scale').trim(),
        top: Math.round(box.top),
        height: Math.round(box.height),
        // No scale applied ⇒ the painted box is the layout box.
        paintedWidth: box.width,
        layoutWidth: (el as HTMLElement).offsetWidth,
      }
    })
    expect(measured.customProperty, 'no-JS: the rise custom property is reset').toBe('none')
    expect(measured.customScale, 'no-JS: the scale custom property is reset').toBe('none')
    expect(
      Math.abs(measured.paintedWidth - measured.layoutWidth),
      `no-JS: painted ${String(measured.paintedWidth)} vs layout ${String(measured.layoutWidth)}`,
    ).toBeLessThanOrEqual(1)
    test
      .info()
      .annotations.push({ type: 'measure', description: `no-JS ${String(width)}px: ${JSON.stringify(measured)}` })
    // And the header still fits: in this state the CTA is a normal in-flow item on the right of the
    // row, exactly like the revealed one, so the row must not overflow the viewport at any lg+ width.
    const metrics = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      headerScroll: (document.querySelector('header') as HTMLElement).scrollWidth,
      headerClient: (document.querySelector('header') as HTMLElement).clientWidth,
      ctaRight: (document.querySelector("header a[href='#reservation']") as HTMLElement).getBoundingClientRect().right,
      rowRight: (document.querySelector('header > div:last-of-type') as HTMLElement).getBoundingClientRect().right,
    }))
    expect(metrics.scroll, `no document overflow at ${String(width)} without JavaScript`).toBeLessThanOrEqual(
      metrics.client,
    )
    expect(metrics.headerScroll, `no header overflow at ${String(width)} without JavaScript`).toBeLessThanOrEqual(
      metrics.headerClient,
    )
    expect(metrics.ctaRight, `the CTA stays inside the header row at ${String(width)}`).toBeLessThanOrEqual(
      metrics.rowRight + 0.5,
    )
    await context.close()
  }

  test('is visually shown at 1024 and 1280, laid out with no leftover offset', async ({ browser }) => {
    await atDesktopWidth(browser, 1024, CTA_SHORT, true)
    await atDesktopWidth(browser, 1280, CTA_LONG, false)
  })

  test('the shown CTA is operable: not inert, focusable, and the plain anchor navigates', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    await page.goto('/preview')
    const cta = page.locator("header a[href='#reservation']")
    await expect(cta).toBeVisible()
    // A painted call to action whose wrapper stays `inert` (server-rendered attribute, liftable by
    // no CSS) is a dead button: the whole subtree is unfocusable and unclickable. Without any
    // script there is nothing to remove the attribute, so it must not be in the served markup.
    await expect(page.locator('header [data-state]')).toHaveJSProperty('inert', false)
    const focusLanded = await cta.evaluate((el) => {
      ;(el as HTMLElement).focus()
      return document.activeElement === el
    })
    expect(focusLanded, 'the no-JS header CTA must be focusable').toBe(true)
    await cta.click()
    await expect(page).toHaveURL(/#reservation$/)
    await context.close()
  })

  /*
   * Mel's decision for this state says the CTA is also present in the accessibility tree. axe-core
   * cannot answer that: `@axe-core/playwright` injects axe by running script in the page, and a
   * `javaScriptEnabled: false` context refuses every injection — so axe in that context is
   * `not verifiable` by construction, never skipped. The renderer's own accessibility tree is
   * computed without page script, so the same claim is read straight off it through CDP
   * (`Accessibility.getFullAXTree`): exactly one un-ignored `link` node carrying the long label.
   */
  test('the shown CTA is in the accessibility tree (renderer AX snapshot over CDP, axe cannot run without JS)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    await page.goto('/preview')
    const session = await context.newCDPSession(page)
    await session.send('Accessibility.enable')
    const { nodes } = (await session.send('Accessibility.getFullAXTree')) as {
      nodes: Array<{ role?: { value?: string }; name?: { value?: string }; ignored?: boolean }>
    }
    const matches = nodes.filter((node) => node.role?.value === 'link' && (node.name?.value ?? '').includes(CTA_LONG))
    expect(
      matches.length,
      `link nodes named "${CTA_LONG}" in the no-JS AX tree: ${JSON.stringify(matches)}`,
    ).toBeGreaterThan(0)
    for (const node of matches) expect(node.ignored, `AX node ${JSON.stringify(node)} must not be ignored`).toBe(false)
    await context.close()
  })

  /*
   * The two progressive-enhancement preferences stack: a no-JavaScript visitor who also asked for
   * reduced motion must still get the visible, operable CTA (the `scripting` override and the
   * `prefers-reduced-motion` block are independent media features, so a regression in either one
   * that only shows up in the combination is caught here).
   */
  test('is shown and operable with reduced motion emulated as well', async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      reducedMotion: 'reduce',
      viewport: { width: 1280, height: 800 },
    })
    const page = await context.newPage()
    await page.goto('/preview')
    const wrapper = page.locator('header [data-state]')
    await expect(wrapper).toHaveCSS('position', 'static')
    await expect(wrapper).toHaveCSS('visibility', 'visible')
    await expect(wrapper).toHaveCSS('opacity', '1')
    await expect(wrapper).toHaveCSS('translate', /^(none|matrix\(1, 0, 0, 1, 0, 0\)|0px 0px)$/)
    await expect(wrapper).toHaveCSS('scale', /^(none|1)$/)
    const cta = page.locator("header a[href='#reservation']")
    await expect(cta).toBeVisible()
    const focusLanded = await cta.evaluate((el) => {
      ;(el as HTMLElement).focus()
      return document.activeElement === el
    })
    expect(focusLanded, 'the no-JS + reduced-motion header CTA must be focusable').toBe(true)
    await cta.click()
    await expect(page).toHaveURL(/#reservation$/)
    await context.close()
  })

  test('is out of the mobile header below lg, with no horizontal overflow', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 800 } })
    const page = await context.newPage()
    await page.goto('/preview')
    // The breakpoint utilities keep deciding: no CTA box in the mobile header at all.
    await expect(page.locator('header [data-state]')).toHaveCSS('display', 'none')
    const metrics = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }))
    expect(metrics.scroll, 'no horizontal overflow at 375 without JavaScript').toBeLessThanOrEqual(metrics.client)
    await context.close()
  })
})

test.describe('header: no horizontal overflow with the CTA revealed', () => {
  for (const width of [1024, 1050, 1100, 1279, 1280]) {
    test(`fits at ${width}px with the CTA visible`, async ({ page }) => {
      await injectSections(page)
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/preview')
      await revealHeaderCta(page)
      const m = await page.evaluate(() => {
        const h = document.querySelector('header')
        const nav = document.querySelector('header nav')
        const logo = document.querySelector('header a[aria-label]')
        const actions = h?.lastElementChild ?? null
        const cta = document.querySelector("header a[href='#reservation']")
        const rect = (el: Element | null) => {
          if (el === null) return null
          const r = el.getBoundingClientRect()
          return { left: r.left, right: r.right, height: r.height }
        }
        return {
          docScroll: document.documentElement.scrollWidth,
          docClient: document.documentElement.clientWidth,
          headerScroll: h?.scrollWidth ?? 0,
          headerClient: h?.clientWidth ?? 0,
          logo: rect(logo),
          nav: rect(nav),
          actions: rect(actions),
          cta: rect(cta),
          linkHeights: Array.from(document.querySelectorAll('header nav a'))
            .map((a) => a.getBoundingClientRect().height)
            .filter((height) => height > 0),
        }
      })
      expect(m.docScroll, 'document scrollWidth').toBeLessThanOrEqual(m.docClient)
      expect(m.headerScroll, 'header scrollWidth').toBeLessThanOrEqual(m.headerClient)
      if (m.logo === null || m.nav === null || m.actions === null || m.cta === null) {
        throw new Error(`header parts missing at ${String(width)}: ${JSON.stringify(m)}`)
      }
      expect(m.logo.right).toBeLessThanOrEqual(m.nav.left + 0.5)
      expect(m.nav.right).toBeLessThanOrEqual(m.actions.left + 0.5)
      expect(m.actions.right).toBeLessThanOrEqual(width)
      expect(m.cta.right).toBeLessThanOrEqual(m.headerClient + 0.5)
      // A wrapped nav link (two lines) is the visible symptom of the break reported in the review.
      const singleLine = Math.min(...m.linkHeights)
      for (const height of m.linkHeights) expect(height).toBeLessThanOrEqual(singleLine + 1)
    })
  }
})

test.describe('header: booking CTA typography', () => {
  /*
   * The header booking call to action is the shared Button at its small size. The design system's
   * Button paints the label in the *body* face (Plus Jakarta Sans, `--softn-font-body`) at weight 600
   * on the body-sm step (14 px) and at line-height 1, so the label adds no leading to the token height
   * of the size. Pinned per breakpoint: 1024 shows the short label, 1280 the long one, same size.
   */
  for (const width of [1024, 1280]) {
    test(`the header CTA renders the small Button typography at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/preview')
      // CSS locator on purpose: while the hero CTA is on screen the ScrollRevealCta keeps this wrapper
      // hidden and inert, and computed typography resolves identically in that state — the contract is
      // about the Button, not about the reveal, which has its own test above.
      const cta = page.locator("header a[href='#reservation']")
      await expect(cta).toHaveAttribute('class', /size-sm/)
      await expect(cta).toHaveCSS('font-size', '14px')
      await expect(cta).toHaveCSS('font-weight', '600')
      await expect(cta).toHaveCSS('font-family', /plus.?jakarta/i)
      await expect(cta).not.toHaveCSS('font-family', /zalando/i)
      // line-height 1 on the 14 px step: a 14 px line box.
      await expect(cta).toHaveCSS('line-height', '14px')
    })
  }
})

test.describe('header: no horizontal overflow', () => {
  for (const width of [1024, 1050, 1100, 1279, 1280]) {
    test(`fits at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/preview')
      await expect(header(page)).toBeVisible()
      const m = await page.evaluate(() => {
        const rect = (el: Element | null) => {
          if (el === null) return null
          const r = el.getBoundingClientRect()
          return { left: r.left, right: r.right, width: r.width, height: r.height }
        }
        const h = document.querySelector('header')
        const nav = document.querySelector('header nav')
        const logo = document.querySelector('header a[aria-label]')
        const actions = h?.lastElementChild ?? null
        const links = Array.from(document.querySelectorAll('header nav a')).map((a) => rect(a))
        return {
          docScroll: document.documentElement.scrollWidth,
          docClient: document.documentElement.clientWidth,
          headerScroll: h?.scrollWidth ?? 0,
          headerClient: h?.clientWidth ?? 0,
          logo: rect(logo),
          nav: rect(nav),
          actions: rect(actions),
          linkHeights: links.map((l) => l?.height ?? 0),
        }
      })
      test.info().annotations.push({
        type: 'measure',
        description: `w=${width} logo=${JSON.stringify(m.logo)} nav=${JSON.stringify(m.nav)} actions=${JSON.stringify(m.actions)} headerScroll=${m.headerScroll}/${m.headerClient}`,
      })
      expect(m.docScroll).toBeLessThanOrEqual(m.docClient)
      expect(m.headerScroll).toBeLessThanOrEqual(m.headerClient)
      const { logo, nav, actions } = m
      expect(logo && nav && actions).toBeTruthy()
      if (logo && nav && actions) {
        expect(logo.right).toBeLessThanOrEqual(nav.left + 0.5)
        expect(nav.right).toBeLessThanOrEqual(actions.left + 0.5)
        expect(actions.right).toBeLessThanOrEqual(width)
      }
      // A wrapped link (two lines) is the visible symptom of the reported break.
      const singleLine = Math.min(...m.linkHeights)
      for (const height of m.linkHeights) expect(height).toBeLessThanOrEqual(singleLine + 1)
    })
  }
})

test.describe('header: mobile drawer', () => {
  test.use({ viewport: BELOW_LG })

  test('a fragment in the URL lands on its section and marks it in the drawer', async ({ page }) => {
    await injectSections(page)
    await page.goto('/preview#assistant')
    // The fragment contract is the same below lg: the reader lands on the section it asked for, and
    // the header marks it — the desktop navigation is hidden here, so the link is picked by CSS.
    await expectAtReadingBand(page, 'assistant')
    await expect(page.locator("header nav a[href='#assistant']")).toHaveAttribute('aria-current', 'location')
    await burger(page).click()
    await expect(drawer(page)).toBeVisible()
    // The drawer is the navigation below lg, and it renders in a portal mounted on open: it must
    // expose the same current location as the header navigation. The drawers nudge the reader's
    // position when they open (the focus move inside a portal at the end of the body), so the
    // comparison is read live instead of pinning the section landed on above.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const current = (root: ParentNode) =>
              root.querySelector("a[aria-current='location']")?.getAttribute('href') ?? null
            const headerLink = current(document.querySelector('header nav') ?? document)
            return headerLink !== null && current(document.querySelector("[role='dialog']") ?? document) === headerLink
          }),
        { message: 'the drawer must expose the same current location as the header navigation' },
      )
      .toBe(true)
  })

  test('burger replaces the nav below lg and toggles aria-expanded', async ({ page }) => {
    await page.goto('/preview')
    await expect(page.getByRole('navigation', { name: MAIN_NAV })).toBeHidden()
    await expect(page.locator("header a[href='#reservation']")).toBeHidden()
    const trigger = burger(page)
    await expect(trigger).toBeVisible()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await trigger.click()
    await expect(drawer(page)).toBeVisible()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(drawer(page)).toBeHidden()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  test('Escape closes the drawer and focus returns to the burger', async ({ page }) => {
    await page.goto('/preview')
    await burger(page).focus()
    await page.keyboard.press('Enter')
    await expect(drawer(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(drawer(page)).toBeHidden()
    await expect(burger(page)).toBeFocused()
  })

  test('first Tab from the close control lands on the first nav link', async ({ page }) => {
    await page.goto('/preview')
    await burger(page).click()
    await expect(drawer(page)).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(drawer(page).getByRole('navigation').getByRole('link').first()).toBeFocused()
  })

  test('closing control is exposed inside the dialog and header theme toggle is not duplicated', async ({ page }) => {
    await page.goto('/preview')
    await burger(page).click()
    await expect(drawer(page)).toBeVisible()
    await expect(drawer(page).getByRole('button', { name: CLOSE })).toHaveCount(1)
    // The only "Menu de navigation" button left is the header burger, inert and out of the a11y tree.
    await expect(page.getByRole('button', { name: BURGER })).toHaveCount(0)
    await expect(burger(page)).toHaveAttribute('aria-label', BURGER)
    await expect(burger(page)).toHaveAttribute('aria-expanded', 'true')
    expect(await burger(page).evaluate((el) => el.closest("[aria-hidden='true'], [inert]") !== null)).toBe(true)
    await expect(drawer(page).getByRole('link', { name: LOGO })).toHaveCount(1)
    // The header sits behind the modal (aria-hidden/inert): the a11y tree holds exactly one logo and one toggle.
    await expect(page.getByRole('link', { name: LOGO })).toHaveCount(1)
    await expect(themeToggle(page)).toHaveCount(1)
    await expect(drawer(page).getByRole('button', { name: TOGGLE_NAME })).toHaveCount(1)
  })

  test('initial focus lands on the close control', async ({ page }) => {
    await page.goto('/preview')
    await burger(page).click()
    await expect(drawer(page)).toBeVisible()
    await expect(drawer(page).getByRole('button', { name: CLOSE })).toBeFocused()
  })

  const FOCUS_CYCLE = ['logo', 'toggle', 'close', 'link', 'link', 'link', 'link', 'link', 'cta'] as const

  /** Classifies the focused element against the dialog content, or "outside" when it is not inside the dialog. */
  const classifyFocus = (page: Page) =>
    page.evaluate(
      ([togglePrefix, closeLabel]) => {
        const active = document.activeElement
        const dialog = document.querySelector("[role='dialog']")
        if (active !== null && active.hasAttribute('data-base-ui-focus-guard')) return 'guard'
        if (active === null || dialog === null || !dialog.contains(active)) return 'outside'
        const label = active.getAttribute('aria-label') ?? ''
        if (active.closest('nav') !== null) return 'link'
        if (label.startsWith(togglePrefix)) return 'toggle'
        if (label === closeLabel) return 'close'
        if (active.tagName === 'A' && active.getAttribute('href') === '/') return 'logo'
        if (active.tagName === 'A') return 'cta'
        return 'outside'
      },
      [TOGGLE_PREFIX, CLOSE] as const,
    )

  /** Presses a key, then waits for the focus guard (transient wrap-around stop) to hand focus back to a real element. */
  const pressSettled = async (page: Page, key: string) => {
    await page.keyboard.press(key)
    await expect.poll(() => classifyFocus(page)).not.toBe('guard')
    return classifyFocus(page)
  }

  test('Tab cycles logo, toggle, close, five links, CTA and wraps without leaving the dialog', async ({ page }) => {
    await page.goto('/preview')
    await burger(page).click()
    await expect(drawer(page)).toBeVisible()
    await expect(drawer(page).getByRole('button', { name: CLOSE })).toBeFocused()
    const seen: string[] = []
    // Start on close (initial focus): 6 stops reach the CTA, then 3 more wrap through logo, toggle, close, and one more full loop.
    for (let i = 0; i < FOCUS_CYCLE.length * 2; i += 1) {
      seen.push(await pressSettled(page, 'Tab'))
    }
    expect(seen.includes('outside'), `focus left the dialog: ${seen.join(',')}`).toBe(false)
    // DOM order is logo, toggle, close, 5 links, CTA. From close: 5 links, CTA, then wrap to logo, toggle, close.
    expect(seen.slice(0, 9)).toEqual(['link', 'link', 'link', 'link', 'link', 'cta', 'logo', 'toggle', 'close'])
    expect(seen.slice(9)).toEqual(['link', 'link', 'link', 'link', 'link', 'cta', 'logo', 'toggle', 'close'])
  })

  test('Shift+Tab cycles in reverse without leaving the dialog', async ({ page }) => {
    await page.goto('/preview')
    await burger(page).click()
    await expect(drawer(page)).toBeVisible()
    await expect(drawer(page).getByRole('button', { name: CLOSE })).toBeFocused()
    const seen: string[] = []
    for (let i = 0; i < FOCUS_CYCLE.length * 2; i += 1) {
      seen.push(await pressSettled(page, 'Shift+Tab'))
    }
    expect(seen.includes('outside'), `focus left the dialog: ${seen.join(',')}`).toBe(false)
    // From close in reverse: toggle, logo, wrap to CTA, 5 links, close.
    expect(seen.slice(0, 9)).toEqual(['toggle', 'logo', 'cta', 'link', 'link', 'link', 'link', 'link', 'close'])
    expect(seen.slice(9)).toEqual(['toggle', 'logo', 'cta', 'link', 'link', 'link', 'link', 'link', 'close'])
  })

  test('theme toggle inside the popup switches the theme', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('softn-theme', 'dark'))
    await page.goto('/preview')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await burger(page).click()
    await expect(drawer(page)).toBeVisible()
    await drawer(page).getByRole('button', { name: TOGGLE_NAME }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(drawer(page)).toBeVisible()
  })

  test('no CSP violation or console error while the drawer opens and closes', async ({ page }) => {
    const problems: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error' || /content security policy|refused to/i.test(message.text())) {
        problems.push(message.text())
      }
    })
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        console.error(`CSP violation: ${event.violatedDirective} ${event.blockedURI}`)
      })
    })
    await page.goto('/preview')
    await burger(page).click()
    await expect(drawer(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(drawer(page)).toBeHidden()
    expect(problems).toEqual([])
  })

  test('drawer lists the five links and a booking CTA', async ({ page }) => {
    await page.goto('/preview')
    await burger(page).click()
    const dialog = drawer(page)
    // Logo, five section links, CTA.
    await expect(dialog.getByRole('link')).toHaveCount(7)
    await expect(dialog.getByRole('navigation').getByRole('link')).toHaveCount(5)
    await expect(dialog.getByRole('link', { name: CTA_LONG })).toBeVisible()
  })

  test('clicking a link closes the drawer then scrolls to the section', async ({ page }) => {
    await injectSections(page)
    await page.goto('/preview')
    await burger(page).click()
    await drawer(page).getByRole('link', { name: FAQ_NAME }).click()
    await expect(drawer(page)).toBeHidden()
    await expect(page).toHaveURL(/#faq$/)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000)
  })

  test('clicking the CTA closes the drawer and goes to #reservation', async ({ page }) => {
    await page.goto('/preview')
    await burger(page).click()
    await drawer(page).getByRole('link', { name: CTA_LONG }).click()
    await expect(drawer(page)).toBeHidden()
    await expect(page).toHaveURL(/#reservation$/)
  })

  test("close control in the burger's spot closes the drawer", async ({ page }) => {
    await page.goto('/preview')
    await burger(page).click()
    await expect(drawer(page)).toBeVisible()
    await drawer(page).getByRole('button', { name: CLOSE }).click()
    await expect(drawer(page)).toBeHidden()
    await expect(burger(page)).toHaveAttribute('aria-expanded', 'false')
  })

  test('resizing to desktop closes the drawer', async ({ page }) => {
    await page.goto('/preview')
    await burger(page).click()
    await expect(drawer(page)).toBeVisible()
    await page.setViewportSize(DESKTOP)
    await expect(drawer(page)).toBeHidden()
    await expect(page.getByRole('navigation', { name: MAIN_NAV })).toBeVisible()
  })

  test('theme toggle stays usable next to the burger', async ({ page }) => {
    await page.goto('/preview')
    await expect(themeToggle(page)).toBeVisible()
  })

  test('drawer link focus is ringed', async ({ page }) => {
    await page.goto('/preview')
    await burger(page).click()
    await page.keyboard.press('Tab')
    const first = drawer(page).getByRole('navigation').getByRole('link').first()
    await expect(first).toBeFocused()
    const outline = await first.evaluate((el) => {
      const style = getComputedStyle(el)
      return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) }
    })
    expect(outline.style).not.toBe('none')
    expect(outline.width).toBeGreaterThanOrEqual(2)
  })

  test('reduced motion: drawer opens without travelling transform', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/preview')
    await burger(page).click()
    const popup = drawer(page)
    await expect(popup).toBeVisible()
    await expect(popup).toHaveCSS('transform', /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/)
    const duration = await popup.evaluate((el) => getComputedStyle(el).transitionProperty)
    expect(duration).not.toContain('transform')
    await page.keyboard.press('Escape')
    await expect(popup).toBeHidden()
  })
})

test.describe('header: drawer top row matches the header', () => {
  for (const width of [375, 768]) {
    for (const scheme of ['dark', 'light'] as const) {
      test(`logo, toggle and close sit on their header positions at ${width}px (${scheme})`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 })
        await page.emulateMedia({ colorScheme: scheme })
        await page.addInitScript((value) => localStorage.setItem('softn-theme', value), scheme)
        await page.goto('/preview')
        await expect(page.locator('html')).toHaveAttribute('data-theme', scheme)
        const rects = (root: string, toggle: string, close: string) =>
          page.evaluate(
            ([r, t, c]) => {
              const box = (el: Element | null) => {
                if (el === null) return null
                const { x, y, width: w, height: h } = el.getBoundingClientRect()
                return { x, y, w, h }
              }
              const scope = document.querySelector(r as string)
              return {
                logo: box(scope?.querySelector('a[aria-label]') ?? null),
                toggle: box(scope?.querySelector(t as string) ?? null),
                button: box(scope?.querySelector('button[aria-expanded]') ?? scope?.querySelector(c as string) ?? null),
                bg:
                  scope === null
                    ? ''
                    : getComputedStyle(
                        scope.getAttribute('role') === 'dialog' ? (scope.firstElementChild ?? scope) : scope,
                      ).backgroundColor,
              }
            },
            [root, toggle, close],
          )
        // Locales-derived selectors: the suite carries no hardcoded French copy.
        const TOGGLE = `button[aria-label^='${TOGGLE_PREFIX}']`
        const CLOSE_BUTTON = `button[aria-label='${CLOSE}']`
        const before = await rects('header', TOGGLE, CLOSE_BUTTON)
        await burger(page).click()
        await expect(drawer(page)).toBeVisible()
        // Wait for the enter transition to finish so the body translate does not skew nothing and opacity is 1.
        await expect(drawer(page)).not.toHaveAttribute('data-starting-style', /.*/)
        await expect.poll(() => drawer(page).evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
        const after = await rects("[role='dialog']", TOGGLE, CLOSE_BUTTON)
        for (const key of ['logo', 'toggle', 'button'] as const) {
          const a = before[key]
          const b = after[key]
          expect(a && b, `${key} missing`).toBeTruthy()
          if (a && b) {
            expect(Math.abs(a.x - b.x), `${key} x ${a.x} vs ${b.x}`).toBeLessThanOrEqual(1)
            expect(Math.abs(a.y - b.y), `${key} y ${a.y} vs ${b.y}`).toBeLessThanOrEqual(1)
            expect(Math.abs(a.w - b.w), `${key} w`).toBeLessThanOrEqual(1)
            expect(Math.abs(a.h - b.h), `${key} h`).toBeLessThanOrEqual(1)
          }
        }
        expect(after.bg, 'drawer bar background equals header background').toBe(before.bg)
      })
    }
  }

  test('top row stays still while the body travels in (no transform on the bar)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/preview')
    await burger(page).click()
    const bar = drawer(page).locator('> div').first()
    await expect(bar).toHaveCSS('transform', 'none')
  })

  test('reduced motion: popup and body carry no transform at any time', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/preview')
    await burger(page).click()
    const popup = drawer(page)
    await expect(popup).toBeVisible()
    const transforms = await popup.evaluate((el) =>
      Array.from(el.querySelectorAll(':scope > div')).map((child) => {
        const style = getComputedStyle(child)
        return { transform: style.transform, property: style.transitionProperty }
      }),
    )
    for (const item of transforms) {
      expect(item.transform).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/)
      expect(item.property).not.toContain('transform')
    }
  })

  type Touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', y: number, x?: number) => Promise<unknown>

  type DrawerOptions = {
    viewport?: { width: number; height: number }
    reducedMotion?: 'reduce' | 'no-preference'
    /** Registers a window listener that claims `open-chatbot` and counts the requests. */
    claimChatbot?: boolean
  }

  const openTouchDrawer = async (
    browser: Browser,
    scheme: 'dark' | 'light',
    options: DrawerOptions = {},
  ): Promise<{ context: BrowserContext; page: Page; touch: Touch }> => {
    const context = await browser.newContext({
      viewport: options.viewport ?? { width: 375, height: 800 },
      hasTouch: true,
      isMobile: true,
      colorScheme: scheme,
      reducedMotion: options.reducedMotion ?? 'no-preference',
    })
    await context.addInitScript((value) => localStorage.setItem('softn-theme', value), scheme)
    if (options.claimChatbot === true) {
      await context.addInitScript(() => {
        Reflect.set(window, '__chatbotRequests', 0)
        window.addEventListener('open-chatbot', (event) => {
          event.preventDefault()
          Reflect.set(window, '__chatbotRequests', Number(Reflect.get(window, '__chatbotRequests')) + 1)
        })
      })
    }
    const page = await context.newPage()
    await page.goto('/preview')
    await expect(page.locator('html')).toHaveAttribute('data-theme', scheme)
    await burger(page).tap()
    await expect(drawer(page)).toBeVisible()
    await expect(drawer(page)).not.toHaveAttribute('data-starting-style', /.*/)
    await expect.poll(() => drawer(page).evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
    const session = await context.newCDPSession(page)
    const touch: Touch = (type, y, x = 200) =>
      session.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
      })
    return { context, page, touch }
  }

  const barBox = (page: Page) => drawer(page).locator('> div').first().boundingBox()
  const bodyLocator = (page: Page) => drawer(page).locator('> div').nth(1)
  const handleLocator = (page: Page) => bodyLocator(page).locator('> div').nth(0)
  const bodyOffset = (page: Page) =>
    bodyLocator(page).evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42)
  const bodyTop = async (page: Page) => (await bodyLocator(page).boundingBox())?.y ?? Number.NaN

  const centerOf = async (locator: Locator): Promise<{ x: number; y: number }> => {
    const box = await locator.boundingBox()
    if (box === null) throw new Error('element has no bounding box')
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }

  /** Drags in `step` increments from `fromY` to `toY` at x, without releasing. */
  const drag = async (touch: Touch, fromY: number, toY: number, x = 200, step = 10) => {
    await touch('touchStart', fromY, x)
    const direction = toY >= fromY ? 1 : -1
    for (let y = fromY + direction * step; direction * (toY - y) >= 0; y += direction * step) {
      await touch('touchMove', y, x)
    }
  }

  type Sample = {
    dismissed: boolean
    barTop: number
    bodyTop: number
    barBottom: number
    bodyTransform: string
    popupOpacity: number
  }

  /** Samples the drawer every frame, including during the exit transition, until the page is left. */
  const startRecorder = (page: Page) =>
    page.evaluate(() => {
      const samples: Sample[] = []
      Reflect.set(window, '__drawerSamples', samples)
      const tick = () => {
        const popup = document.querySelector('[role="dialog"]')
        const bar = popup?.children[0]
        const body = popup?.children[1]
        if (popup && bar && body) {
          const barRect = bar.getBoundingClientRect()
          samples.push({
            dismissed: popup.hasAttribute('data-swipe-dismissed'),
            barTop: barRect.top,
            barBottom: barRect.bottom,
            bodyTop: body.getBoundingClientRect().top,
            bodyTransform: getComputedStyle(body).transform,
            popupOpacity: Number.parseFloat(getComputedStyle(popup).opacity),
          })
        }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  const readSamples = (page: Page) => page.evaluate(() => Reflect.get(window, '__drawerSamples') as Sample[])

  const backdropOpacity = (page: Page) =>
    page.evaluate(() => {
      const el = document.querySelector('[class*="backdrop"]')
      return el === null ? Number.NaN : Number.parseFloat(getComputedStyle(el).opacity)
    })

  test('handle swipe, partial: bar stays put, body tracks the finger, then snaps back below threshold', async ({
    browser,
  }, testInfo) => {
    const { context, page, touch } = await openTouchDrawer(browser, 'dark')
    const before = await barBox(page)
    const topBefore = await bodyTop(page)
    expect(before).not.toBeNull()
    const handle = await centerOf(handleLocator(page))
    await startRecorder(page)
    const travel = 100
    await drag(touch, handle.y, handle.y + travel)
    await expect.poll(() => bodyOffset(page)).toBeGreaterThan(20)
    await page.waitForTimeout(100)
    const offset = await bodyOffset(page)
    testInfo.annotations.push({ type: 'measure', description: `finger=${travel}px body=${offset}px` })
    // The library absorbs the first move (touch slop) so the body trails the finger by a small constant.
    expect(offset).toBeLessThanOrEqual(travel + 1)
    expect(travel - offset).toBeLessThanOrEqual(25)
    expect(Math.abs((await bodyTop(page)) - topBefore - offset)).toBeLessThanOrEqual(1)
    expect(await backdropOpacity(page)).toBeLessThan(1)
    const during = await barBox(page)
    if (before && during) {
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs(before[key] - during[key]), `bar ${key} moved during swipe`).toBeLessThanOrEqual(1)
      }
    }
    await expect(drawer(page)).toHaveCSS('transform', 'none')
    await touch('touchEnd', handle.y + travel)
    await expect(drawer(page)).toBeVisible()
    await expect.poll(() => bodyOffset(page)).toBe(0)
    await expect.poll(() => backdropOpacity(page)).toBe(1)
    await expect(drawer(page)).not.toHaveAttribute('data-swipe-dismissed', /.*/)
    const samples = await readSamples(page)
    expect(samples.some((sample) => sample.dismissed)).toBe(false)
    for (const sample of samples) expect(Math.abs(sample.barTop - (before?.y ?? 0))).toBeLessThanOrEqual(1)
    await context.close()
  })

  test('body rect tracks the finger during touchmove, before touchend', async ({ browser }) => {
    const { context, page, touch } = await openTouchDrawer(browser, 'dark')
    const handle = await centerOf(handleLocator(page))
    const topBefore = await bodyTop(page)
    await touch('touchStart', handle.y)
    // Small steps like a real finger; the library absorbs the first move as touch slop.
    for (let travel = 10; travel <= 150; travel += 10) {
      await touch('touchMove', handle.y + travel)
      if (travel % 30 !== 0) continue
      await expect
        .poll(
          async () => {
            const delta = (await bodyTop(page)) - topBefore
            return delta <= travel + 1 && travel - delta <= 25
          },
          { message: `body follows finger at ${travel}px` },
        )
        .toBe(true)
    }
    await touch('touchEnd', handle.y + 150)
    await context.close()
  })

  test('top bar swipe: the body follows, release below threshold snaps back, the bar never moves', async ({
    browser,
  }) => {
    const { context, page, touch } = await openTouchDrawer(browser, 'dark')
    const bar = await barBox(page)
    expect(bar).not.toBeNull()
    const startY = (bar?.y ?? 0) + (bar?.height ?? 0) / 2
    await startRecorder(page)
    await drag(touch, startY, startY + 80, 200)
    await expect.poll(() => bodyOffset(page)).toBeGreaterThan(20)
    await touch('touchEnd', startY + 80)
    await expect(drawer(page)).toBeVisible()
    await expect.poll(() => bodyOffset(page)).toBe(0)
    const samples = await readSamples(page)
    for (const sample of samples) expect(Math.abs(sample.barTop - (bar?.y ?? 0))).toBeLessThanOrEqual(1)
    await context.close()
  })

  test('pinch-zoom is not blocked: popup and viewport touch-action keep pinch-zoom', async ({ browser }) => {
    const { context, page } = await openTouchDrawer(browser, 'dark')
    const popupAction = await drawer(page).evaluate((el) => getComputedStyle(el).touchAction)
    expect(popupAction).toContain('pinch-zoom')
    expect(popupAction).not.toBe('none')
    const viewportAction = await drawer(page).evaluate((el) => {
      const viewport = el.parentElement
      return viewport === null ? '' : getComputedStyle(viewport).touchAction
    })
    expect(viewportAction).toContain('pinch-zoom')
    await context.close()
  })

  test('slow short drag released: the drawer stays open and snaps back', async ({ browser }) => {
    const { context, page, touch } = await openTouchDrawer(browser, 'dark')
    const handle = await centerOf(handleLocator(page))
    await touch('touchStart', handle.y)
    for (let travel = 10; travel <= 80; travel += 10) {
      await touch('touchMove', handle.y + travel)
      await page.waitForTimeout(40)
    }
    await expect.poll(() => bodyOffset(page)).toBeGreaterThan(20)
    await page.waitForTimeout(300)
    await touch('touchEnd', handle.y + 80)
    await page.waitForTimeout(500)
    await expect(drawer(page)).toBeVisible()
    await expect(drawer(page)).not.toHaveAttribute('data-swipe-dismissed', /.*/)
    await expect.poll(() => bodyOffset(page)).toBe(0)
    await context.close()
  })

  test('long slow drag released: the drawer dismisses', async ({ browser }) => {
    const { context, page, touch } = await openTouchDrawer(browser, 'dark')
    const handle = await centerOf(handleLocator(page))
    await touch('touchStart', handle.y)
    for (let travel = 20; travel <= 560; travel += 20) {
      await touch('touchMove', handle.y + travel)
      await page.waitForTimeout(25)
    }
    await page.waitForTimeout(300)
    await touch('touchEnd', handle.y + 560)
    await expect(drawer(page)).toBeHidden()
    await context.close()
  })

  test('handle swipe past 50%: the body leaves the viewport, the bar stays, focus returns to the burger', async ({
    browser,
  }) => {
    const { context, page, touch } = await openTouchDrawer(browser, 'dark')
    const viewportHeight = 800
    const handle = await centerOf(handleLocator(page))
    await startRecorder(page)
    const bar = await barBox(page)
    await drag(touch, handle.y, handle.y + 420, 200, 20)
    await touch('touchEnd', handle.y + 420)
    await expect(drawer(page)).toBeHidden()
    const samples = await readSamples(page)
    expect(
      samples.some((sample) => sample.dismissed),
      'data-swipe-dismissed was set on exit',
    ).toBe(true)
    const dismissed = samples.filter((sample) => sample.dismissed)
    const farthest = Math.max(...dismissed.map((sample) => sample.bodyTop))
    expect(farthest, 'body travelled off the bottom of the viewport').toBeGreaterThanOrEqual(viewportHeight - 1)
    for (const sample of samples) expect(Math.abs(sample.barTop - (bar?.y ?? 0))).toBeLessThanOrEqual(1)
    await expect(burger(page)).toBeFocused()
    await expect(burger(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('button', { name: BURGER })).toHaveCount(1)
    await context.close()
  })

  test('fast flick below the distance threshold still dismisses by velocity and exits off-screen', async ({
    browser,
  }) => {
    const { context, page, touch } = await openTouchDrawer(browser, 'dark')
    const handle = await centerOf(handleLocator(page))
    await startRecorder(page)
    await touch('touchStart', handle.y)
    await touch('touchMove', handle.y + 20)
    await touch('touchMove', handle.y + 50)
    await touch('touchMove', handle.y + 90)
    await touch('touchEnd', handle.y + 90)
    await expect(drawer(page)).toBeHidden()
    const samples = await readSamples(page)
    expect(samples.some((sample) => sample.dismissed)).toBe(true)
    expect(
      Math.max(...samples.filter((sample) => sample.dismissed).map((sample) => sample.bodyTop)),
    ).toBeGreaterThanOrEqual(799)
    await context.close()
  })

  for (const target of ['link', 'cta'] as const) {
    test(`a swipe starting over the ${target} does not move the body nor dismiss`, async ({ browser }) => {
      const { context, page, touch } = await openTouchDrawer(browser, 'dark')
      const element =
        target === 'link'
          ? drawer(page).getByRole('navigation').getByRole('link').nth(1)
          : drawer(page).getByRole('link', { name: CTA_LONG })
      const point = await centerOf(element)
      await startRecorder(page)
      await drag(touch, point.y, point.y + 500, point.x, 25)
      await page.waitForTimeout(150)
      expect(await bodyOffset(page)).toBe(0)
      expect(await backdropOpacity(page)).toBe(1)
      await touch('touchEnd', point.y + 500, point.x)
      await page.waitForTimeout(500)
      await expect(drawer(page)).toBeVisible()
      await expect(drawer(page)).not.toHaveAttribute('data-swipe-dismissed', /.*/)
      const samples = await readSamples(page)
      for (const sample of samples) {
        expect(sample.dismissed).toBe(false)
        expect(sample.bodyTransform).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/)
      }
      await context.close()
    })
  }

  test('320x480: the nav list scrolls by touch, the drawer stays open and the body does not move', async ({
    browser,
  }) => {
    const { context, page, touch } = await openTouchDrawer(browser, 'dark', {
      viewport: { width: 320, height: 480 },
    })
    const nav = drawer(page).getByRole('navigation')
    const metrics = await nav.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }))
    expect(metrics.scroll, 'the nav list overflows at 320x480').toBeGreaterThan(metrics.client)
    const link = await centerOf(nav.getByRole('link').first())
    // Finger moves up: content scrolls down.
    await drag(touch, link.y, link.y - 120, link.x, 10)
    expect(await bodyOffset(page), 'body does not travel while the list scrolls').toBe(0)
    await touch('touchEnd', link.y - 120, link.x)
    await expect.poll(() => nav.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    await expect(drawer(page)).toBeVisible()
    expect(await bodyOffset(page)).toBe(0)
    // Finger moves down at the top edge of the list must not dismiss either.
    const scrolled = await nav.evaluate((el) => el.scrollTop)
    // The first link has scrolled out of view: start inside the visible part of the list instead.
    const navBox = await nav.boundingBox()
    if (navBox === null) throw new Error('nav has no bounding box')
    const back = { x: navBox.x + navBox.width / 2, y: navBox.y + 30 }
    await drag(touch, back.y, back.y + 200, back.x, 10)
    expect(await bodyOffset(page), 'body does not travel on a pull at the list top').toBe(0)
    await touch('touchEnd', back.y + 200, back.x)
    await page.waitForTimeout(400)
    await expect(drawer(page)).toBeVisible()
    expect(scrolled).toBeGreaterThan(0)
    await context.close()
  })

  test('handle is decorative: aria-hidden, no focusable descendant, absent from the Tab cycle', async ({ browser }) => {
    const { context, page } = await openTouchDrawer(browser, 'dark')
    const handle = handleLocator(page)
    await expect(handle).toHaveAttribute('aria-hidden', 'true')
    await expect(handle.locator('a, button, input, [tabindex]')).toHaveCount(0)
    expect(await handle.evaluate((el) => (el.textContent ?? '').trim())).toBe('')
    const height = (await handle.boundingBox())?.height ?? 0
    expect(height).toBeGreaterThanOrEqual(44)
    const snapshot = await drawer(page).ariaSnapshot()
    // 1 dialog + logo, toggle, close + five links + CTA: nothing unnamed in between.
    expect(snapshot).not.toMatch(/presentation|separator|img/)
    // 3 top-row stops + 5 links + CTA, then it wraps: the handle contributes none.
    const stops = new Set<string>()
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab')
      // The library's wrap-around focus guard is a transient stop: wait for focus to land back on a real control.
      await expect
        .poll(() =>
          page.evaluate(() => {
            const active = document.activeElement
            const dialog = document.querySelector("[role='dialog']")
            return (
              active !== null &&
              dialog !== null &&
              dialog.contains(active) &&
              !active.hasAttribute('data-base-ui-focus-guard')
            )
          }),
        )
        .toBe(true)
      stops.add(await focusedName(page))
    }
    expect(stops.size).toBe(9)
    await context.close()
  })

  for (const scheme of ['dark', 'light'] as const) {
    test(`handle pill contrast >= 3:1 against the drawer background (${scheme})`, async ({ browser }) => {
      const { context, page } = await openTouchDrawer(browser, scheme)
      const pill = handleLocator(page).locator('> span')
      const pillColor = await pill.evaluate((el) => getComputedStyle(el).backgroundColor)
      const bgColor = await bodyLocator(page).evaluate((el) => getComputedStyle(el).backgroundColor)
      const ratio = await page.evaluate(
        ([a, b]) => {
          const toRgb = (css: string): [number, number, number] => {
            const canvas = document.createElement('canvas')
            canvas.width = 1
            canvas.height = 1
            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            if (ctx === null) throw new Error('no 2d context')
            ctx.fillStyle = css
            ctx.fillRect(0, 0, 1, 1)
            const [r = 0, g = 0, bl = 0] = ctx.getImageData(0, 0, 1, 1).data
            return [r, g, bl]
          }
          const lum = ([r, g, bl]: [number, number, number]) => {
            const f = (v: number) => {
              const c = v / 255
              return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
            }
            return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl)
          }
          const [hi, lo] = [lum(toRgb(a ?? '')), lum(toRgb(b ?? ''))].sort((x, y) => y - x) as [number, number]
          return (hi + 0.05) / (lo + 0.05)
        },
        [pillColor, bgColor],
      )
      expect(ratio).toBeGreaterThanOrEqual(3)
      await context.close()
    })
  }

  test('reduced motion: the body follows the finger live, the dismissal fades only with no transform', async ({
    browser,
  }) => {
    const { context, page, touch } = await openTouchDrawer(browser, 'dark', { reducedMotion: 'reduce' })
    const handle = await centerOf(handleLocator(page))
    await startRecorder(page)
    await drag(touch, handle.y, handle.y + 420, 200, 20)
    await touch('touchEnd', handle.y + 420)
    await expect(drawer(page)).toBeHidden()
    const samples = await readSamples(page)
    expect(samples.length).toBeGreaterThan(0)
    // The body still follows the finger live; only the exit after release is a plain fade.
    expect(samples.some((sample) => !sample.dismissed && sample.bodyTop - sample.barBottom > 20)).toBe(true)
    const dismissed = samples.filter((sample) => sample.dismissed)
    expect(dismissed.length).toBeGreaterThan(0)
    for (const sample of dismissed) {
      expect(sample.bodyTransform).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/)
      expect(Math.abs(sample.bodyTop - sample.barBottom)).toBeLessThanOrEqual(1)
    }
    await context.close()
  })

  for (const way of ['escape', 'close button', 'link'] as const) {
    test(`non-swipe exit by ${way} keeps the short exit: no swipe flag, body travels at most one space step`, async ({
      browser,
    }) => {
      const { context, page } = await openTouchDrawer(browser, 'dark')
      await startRecorder(page)
      if (way === 'escape') await page.keyboard.press('Escape')
      if (way === 'close button') await drawer(page).getByRole('button', { name: CLOSE }).tap()
      if (way === 'link') await drawer(page).getByRole('navigation').getByRole('link').first().tap()
      await expect(drawer(page)).toBeHidden()
      const samples = await readSamples(page)
      expect(samples.length).toBeGreaterThan(0)
      for (const sample of samples) {
        expect(sample.dismissed).toBe(false)
        expect(sample.bodyTop - sample.barBottom).toBeLessThanOrEqual(33)
      }
      await context.close()
    })
  }

  test('a failed swipe over the CTA then a tap on it still dispatches open-chatbot once and closes the drawer', async ({
    browser,
  }) => {
    const { context, page, touch } = await openTouchDrawer(browser, 'dark', { claimChatbot: true })
    const cta = drawer(page).getByRole('link', { name: CTA_LONG })
    const point = await centerOf(cta)
    await drag(touch, point.y, point.y + 200, point.x, 25)
    await touch('touchEnd', point.y + 200, point.x)
    await page.waitForTimeout(300)
    await expect(drawer(page)).toBeVisible()
    await cta.tap()
    await expect(drawer(page)).toBeHidden()
    await expect.poll(() => page.evaluate(() => Reflect.get(window, '__chatbotRequests'))).toBe(1)
    await expect(page).not.toHaveURL(/#reservation$/)
    await context.close()
  })

  test('a link tap after a swipe-over-link attempt still closes then scrolls to the section', async ({ browser }) => {
    const { context, page, touch } = await openTouchDrawer(browser, 'dark')
    const link = drawer(page).getByRole('link', { name: FAQ_NAME })
    const point = await centerOf(link)
    await drag(touch, point.y, point.y + 200, point.x, 25)
    await touch('touchEnd', point.y + 200, point.x)
    await page.waitForTimeout(300)
    await expect(drawer(page)).toBeVisible()
    await link.tap()
    await expect(drawer(page)).toBeHidden()
    await expect(page).toHaveURL(/#faq$/)
    await context.close()
  })

  for (const scheme of ['dark', 'light'] as const) {
    test(`no seam between drawer bar and header mid-swipe (${scheme})`, async ({ browser }) => {
      const { context, page, touch } = await openTouchDrawer(browser, scheme)
      const headerBg = await page.evaluate(() => {
        const el = document.querySelector('header')
        return el === null ? '' : getComputedStyle(el).backgroundColor
      })
      const handle = await centerOf(handleLocator(page))
      await drag(touch, handle.y, handle.y + 60)
      await expect.poll(() => bodyOffset(page)).toBeGreaterThan(20)
      const bar = drawer(page).locator('> div').first()
      await expect(bar).toHaveCSS('background-color', headerBg)
      await expect(bodyLocator(page)).toHaveCSS('background-color', headerBg)
      const barRect = await bar.boundingBox()
      const headerRect = await header(page).boundingBox()
      expect(barRect).not.toBeNull()
      expect(headerRect).not.toBeNull()
      if (barRect && headerRect) {
        expect(Math.abs(barRect.y - headerRect.y)).toBeLessThanOrEqual(1)
        expect(Math.abs(barRect.height - headerRect.height)).toBeLessThanOrEqual(1)
      }
      await touch('touchEnd', handle.y + 60)
      await context.close()
    })
  }
})

test.describe('header: contrast in both themes', () => {
  test.use({ viewport: DESKTOP })

  const ratioScript = () => {
    const toRgb = (css: string): [number, number, number] => {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (ctx === null) throw new Error('no 2d context')
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data
      return [r, g, b]
    }
    const lum = ([r, g, b]: [number, number, number]) => {
      const f = (v: number) => {
        const c = v / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [lum(toRgb(a)), lum(toRgb(b))].sort((x, y) => y - x) as [number, number]
      return (hi + 0.05) / (lo + 0.05)
    }
    const header = document.querySelector('header') as HTMLElement
    const link = document.querySelector('header nav a') as HTMLElement
    const bg = getComputedStyle(header).backgroundColor
    const idle = ratio(getComputedStyle(link).color, bg)
    link.style.transition = 'none'
    link.setAttribute('aria-current', 'location')
    const activeStyle = getComputedStyle(link)
    const active = ratio(activeStyle.color, bg)
    const underline = ratio(activeStyle.textDecorationColor, bg)
    link.removeAttribute('aria-current')
    return { idle, active, underline }
  }

  for (const scheme of ['dark', 'light'] as const) {
    test(`nav link text >= 4.5:1 and active underline >= 3:1 (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.addInitScript((value) => localStorage.setItem('softn-theme', value), scheme)
      await page.goto('/preview')
      await expect(page.locator('html')).toHaveAttribute('data-theme', scheme)
      const { idle, active, underline } = await page.evaluate(ratioScript)
      expect(idle, 'idle link contrast').toBeGreaterThanOrEqual(4.5)
      expect(active, 'active link contrast').toBeGreaterThanOrEqual(4.5)
      expect(underline, 'active underline contrast').toBeGreaterThanOrEqual(3)
    })

    /*
     * The revealed booking CTA is `visibility: hidden` at the top of the page, so the analyses above
     * never see its colors: it is measured here, once revealed and fully faded in (the 0.2 floor of
     * the hero fade was the PR #75 lesson — a mid-fade measurement is not a real contrast).
     */
    test(`revealed booking CTA label >= 4.5:1 on its background (${scheme})`, async ({ page }) => {
      await injectSections(page)
      await page.emulateMedia({ colorScheme: scheme })
      await page.addInitScript((value) => localStorage.setItem('softn-theme', value), scheme)
      await page.goto('/preview')
      await expect(page.locator('html')).toHaveAttribute('data-theme', scheme)
      await revealHeaderCta(page)
      await expect
        .poll(() => page.locator('header [data-state]').evaluate((el) => getComputedStyle(el).opacity))
        .toBe('1')
      const ratio = await page.locator("header a[href='#reservation']").evaluate((el) => {
        const toRgb = (css: string): [number, number, number] => {
          const canvas = document.createElement('canvas')
          canvas.width = 1
          canvas.height = 1
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          if (ctx === null) throw new Error('no 2d context')
          ctx.clearRect(0, 0, 1, 1)
          ctx.fillStyle = css
          ctx.fillRect(0, 0, 1, 1)
          const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data
          return [r, g, b]
        }
        const lum = ([r, g, b]: [number, number, number]) => {
          const f = (v: number) => {
            const c = v / 255
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
          }
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
        }
        const style = getComputedStyle(el)
        const [hi, lo] = [lum(toRgb(style.color)), lum(toRgb(style.backgroundColor))].sort((x, y) => y - x) as [
          number,
          number,
        ]
        return (hi + 0.05) / (lo + 0.05)
      })
      test.info().annotations.push({
        type: 'measure',
        description: `revealed booking CTA label contrast (${scheme}): ${ratio.toFixed(2)}:1`,
      })
      expect(ratio, `revealed CTA label contrast (${scheme})`).toBeGreaterThanOrEqual(4.5)
    })
  }
})
