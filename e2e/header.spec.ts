import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'

const SKIP_LINK = 'Aller au contenu principal'
const BURGER = 'Menu de navigation'
const CLOSE = 'Fermer le menu'
const MAIN_NAV = 'Navigation principale'
const CTA_LONG = 'Réserver mon échange Spark'
const CTA_SHORT = 'Réserver mon échange'
const LOGO = "softn.io, retour à l'accueil"

const NAV_LINKS = [
  { label: 'Comment je vous aide', aria: 'Comment je vous aide, services pour votre activité', id: 'services' },
  { label: 'Du cadrage au suivi', aria: 'Du cadrage au suivi, ma méthode de travail', id: 'methode' },
  { label: 'Demandez à', aria: 'Demandez à', id: 'assistant' },
  { label: 'En coulisses', aria: 'En coulisses, comment ce site a été construit', id: 'coulisses' },
  { label: 'FAQ', aria: 'FAQ, questions fréquentes', id: 'faq' },
] as const

const DESKTOP = { width: 1280, height: 800 }
const BELOW_LG = { width: 1023, height: 800 }

const header = (page: Page) => page.locator('header')
/** CSS locator: while the drawer is open the header is aria-hidden, so a role query would not find the burger. */
const burger = (page: Page) => page.locator('header button[aria-expanded]')
const drawer = (page: Page) => page.getByRole('dialog', { name: BURGER })
const themeToggle = (page: Page) => page.getByRole('button', { name: /Passer au mode/ })

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

test.describe('header: desktop', () => {
  test.use({ viewport: DESKTOP })

  test('landmarks: one banner, labelled nav, main target of the skip link', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('banner')).toHaveCount(1)
    await expect(page.getByRole('navigation', { name: MAIN_NAV })).toBeVisible()
    await expect(page.locator('main#main')).toHaveCount(1)
    await expect(burger(page)).toBeHidden()
  })

  test('skip link is the first Tab stop, becomes visible and targets #main', async ({ page }) => {
    await page.goto('/')
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

  test('Tab order: skip link, logo, five nav links, theme toggle, CTA', async ({ page }) => {
    await page.goto('/')
    const names: string[] = []
    for (let i = 0; i < 9; i += 1) {
      await page.keyboard.press('Tab')
      names.push(await focusedName(page))
    }
    expect(names[0]).toBe(SKIP_LINK)
    expect(names[1]).toBe(LOGO)
    NAV_LINKS.forEach((link, i) => {
      expect(names[2 + i]).toContain(link.label)
    })
    expect(names[7]).toMatch(/Passer au mode/)
    expect(names[8]).toBe(CTA_LONG)
  })

  test('nav accessible names start with the visible text (WCAG 2.5.3)', async ({ page }) => {
    await page.goto('/')
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

  test('focus is visibly ringed on logo, nav link and CTA', async ({ page }) => {
    await page.goto('/')
    // Tab stops: skip link, logo, 5 nav links, theme toggle, CTA.
    const expected = new Map([
      [2, 'logo'],
      [3, 'nav link'],
      [9, 'CTA'],
    ])
    for (let stop = 1; stop <= 9; stop += 1) {
      await page.keyboard.press('Tab')
      const label = expected.get(stop)
      if (label === undefined) continue
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
    await page.goto('/')
    await page.evaluate(() => window.scrollTo(0, 1500))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000)
    const top = await header(page).evaluate((el) => el.getBoundingClientRect().top)
    expect(top).toBe(0)
    await expect(page.getByRole('link', { name: CTA_LONG })).toBeVisible()
  })

  test('CTA is visible and not inert while the hero CTA does not exist', async ({ page }) => {
    await page.goto('/')
    const cta = page.getByRole('link', { name: CTA_LONG })
    await expect(cta).toBeVisible()
    await expect(cta.locator('xpath=ancestor::div[@data-state][1]')).toHaveAttribute('data-state', 'visible')
  })

  test('CTA click without a listener or section does not throw and sets #reservation', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    await page.getByRole('link', { name: CTA_LONG }).click()
    await expect(page).toHaveURL(/#reservation$/)
    expect(errors).toEqual([])
  })

  test('in-page links update the URL hash and mark the target section active', async ({ page }) => {
    await injectSections(page)
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: MAIN_NAV })
    await expect(nav.locator('[aria-current]')).toHaveCount(0)
    await nav.getByRole('link', { name: /^Du cadrage au suivi/ }).click()
    await expect(page).toHaveURL(/#methode$/)
    await expect(nav.getByRole('link', { name: /^Du cadrage au suivi/ })).toHaveAttribute('aria-current', 'location')
    await expect(nav.locator('[aria-current]')).toHaveCount(1)
  })

  test('scrolling moves the active link with the reading position', async ({ page }) => {
    await injectSections(page)
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: MAIN_NAV })
    await page.evaluate(() => document.getElementById('coulisses')?.scrollIntoView())
    await expect(nav.getByRole('link', { name: /^En coulisses/ })).toHaveAttribute('aria-current', 'location')
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(nav.locator('[aria-current]')).toHaveCount(0)
  })
})

test.describe('header: single CTA label per breakpoint', () => {
  test('1279 shows the short label only, 1280 the long one only', async ({ page }) => {
    await page.setViewportSize({ width: 1279, height: 800 })
    await page.goto('/')
    await expect(page.getByRole('link', { name: CTA_SHORT, exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: CTA_LONG })).toHaveCount(0)
    await expect(page.locator("header a[href='#reservation']")).toHaveCount(1)

    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(page.getByRole('link', { name: CTA_LONG })).toBeVisible()
    await expect(page.getByRole('link', { name: CTA_SHORT, exact: true })).toHaveCount(0)
  })
})

test.describe('header: no horizontal overflow', () => {
  for (const width of [1024, 1050, 1100, 1279, 1280]) {
    test(`fits at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/')
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

  test('burger replaces the nav below lg and toggles aria-expanded', async ({ page }) => {
    await page.goto('/')
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
    await page.goto('/')
    await burger(page).focus()
    await page.keyboard.press('Enter')
    await expect(drawer(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(drawer(page)).toBeHidden()
    await expect(burger(page)).toBeFocused()
  })

  test('first Tab from the close control lands on the first nav link', async ({ page }) => {
    await page.goto('/')
    await burger(page).click()
    await expect(drawer(page)).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(drawer(page).getByRole('navigation').getByRole('link').first()).toBeFocused()
  })

  test('closing control is exposed inside the dialog and header theme toggle is not duplicated', async ({ page }) => {
    await page.goto('/')
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
    await expect(drawer(page).getByRole('button', { name: /Passer au mode/ })).toHaveCount(1)
  })

  test('initial focus lands on the close control', async ({ page }) => {
    await page.goto('/')
    await burger(page).click()
    await expect(drawer(page)).toBeVisible()
    await expect(drawer(page).getByRole('button', { name: CLOSE })).toBeFocused()
  })

  const FOCUS_CYCLE = ['logo', 'toggle', 'close', 'link', 'link', 'link', 'link', 'link', 'cta'] as const

  /** Classifies the focused element against the dialog content, or "outside" when it is not inside the dialog. */
  const classifyFocus = (page: Page) =>
    page.evaluate(() => {
      const active = document.activeElement
      const dialog = document.querySelector("[role='dialog']")
      if (active !== null && active.hasAttribute('data-base-ui-focus-guard')) return 'guard'
      if (active === null || dialog === null || !dialog.contains(active)) return 'outside'
      const label = active.getAttribute('aria-label') ?? ''
      if (active.closest('nav') !== null) return 'link'
      if (label.startsWith('Passer au mode')) return 'toggle'
      if (label === 'Fermer le menu') return 'close'
      if (active.tagName === 'A' && active.getAttribute('href') === '/') return 'logo'
      if (active.tagName === 'A') return 'cta'
      return 'outside'
    })

  /** Presses a key, then waits for the focus guard (transient wrap-around stop) to hand focus back to a real element. */
  const pressSettled = async (page: Page, key: string) => {
    await page.keyboard.press(key)
    await expect.poll(() => classifyFocus(page)).not.toBe('guard')
    return classifyFocus(page)
  }

  test('Tab cycles logo, toggle, close, five links, CTA and wraps without leaving the dialog', async ({ page }) => {
    await page.goto('/')
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
    await page.goto('/')
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
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await burger(page).click()
    await expect(drawer(page)).toBeVisible()
    await drawer(page)
      .getByRole('button', { name: /Passer au mode/ })
      .click()
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
    await page.goto('/')
    await burger(page).click()
    await expect(drawer(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(drawer(page)).toBeHidden()
    expect(problems).toEqual([])
  })

  test('drawer lists the five links and a booking CTA', async ({ page }) => {
    await page.goto('/')
    await burger(page).click()
    const dialog = drawer(page)
    // Logo, five section links, CTA.
    await expect(dialog.getByRole('link')).toHaveCount(7)
    await expect(dialog.getByRole('navigation').getByRole('link')).toHaveCount(5)
    await expect(dialog.getByRole('link', { name: CTA_LONG })).toBeVisible()
  })

  test('clicking a link closes the drawer then scrolls to the section', async ({ page }) => {
    await injectSections(page)
    await page.goto('/')
    await burger(page).click()
    await drawer(page).getByRole('link', { name: /^FAQ/ }).click()
    await expect(drawer(page)).toBeHidden()
    await expect(page).toHaveURL(/#faq$/)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000)
  })

  test('clicking the CTA closes the drawer and goes to #reservation', async ({ page }) => {
    await page.goto('/')
    await burger(page).click()
    await drawer(page).getByRole('link', { name: CTA_LONG }).click()
    await expect(drawer(page)).toBeHidden()
    await expect(page).toHaveURL(/#reservation$/)
  })

  test("close control in the burger's spot closes the drawer", async ({ page }) => {
    await page.goto('/')
    await burger(page).click()
    await expect(drawer(page)).toBeVisible()
    await drawer(page).getByRole('button', { name: CLOSE }).click()
    await expect(drawer(page)).toBeHidden()
    await expect(burger(page)).toHaveAttribute('aria-expanded', 'false')
  })

  test('resizing to desktop closes the drawer', async ({ page }) => {
    await page.goto('/')
    await burger(page).click()
    await expect(drawer(page)).toBeVisible()
    await page.setViewportSize(DESKTOP)
    await expect(drawer(page)).toBeHidden()
    await expect(page.getByRole('navigation', { name: MAIN_NAV })).toBeVisible()
  })

  test('theme toggle stays usable next to the burger', async ({ page }) => {
    await page.goto('/')
    await expect(themeToggle(page)).toBeVisible()
  })

  test('drawer link focus is ringed', async ({ page }) => {
    await page.goto('/')
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
    await page.goto('/')
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
        await page.goto('/')
        await expect(page.locator('html')).toHaveAttribute('data-theme', scheme)
        const rects = (root: string, toggle: string) =>
          page.evaluate(
            ([r, t]) => {
              const box = (el: Element | null) => {
                if (el === null) return null
                const { x, y, width: w, height: h } = el.getBoundingClientRect()
                return { x, y, w, h }
              }
              const scope = document.querySelector(r as string)
              return {
                logo: box(scope?.querySelector('a[aria-label]') ?? null),
                toggle: box(scope?.querySelector(t as string) ?? null),
                button: box(
                  scope?.querySelector('button[aria-expanded]') ??
                    scope?.querySelector("button[aria-label='Fermer le menu']") ??
                    null,
                ),
                bg:
                  scope === null
                    ? ''
                    : getComputedStyle(
                        scope.getAttribute('role') === 'dialog' ? (scope.firstElementChild ?? scope) : scope,
                      ).backgroundColor,
              }
            },
            [root, toggle],
          )
        const TOGGLE = "button[aria-label^='Passer au mode']"
        const before = await rects('header', TOGGLE)
        await burger(page).click()
        await expect(drawer(page)).toBeVisible()
        // Wait for the enter transition to finish so the body translate does not skew nothing and opacity is 1.
        await expect(drawer(page)).not.toHaveAttribute('data-starting-style', /.*/)
        await expect.poll(() => drawer(page).evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
        const after = await rects("[role='dialog']", TOGGLE)
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
    await page.goto('/')
    await burger(page).click()
    const bar = drawer(page).locator('> div').first()
    await expect(bar).toHaveCSS('transform', 'none')
  })

  test('reduced motion: popup and body carry no transform at any time', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
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
    await page.goto('/')
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
    const link = drawer(page).getByRole('link', { name: /^FAQ/ })
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
      await page.goto('/')
      await expect(page.locator('html')).toHaveAttribute('data-theme', scheme)
      const { idle, active, underline } = await page.evaluate(ratioScript)
      expect(idle, 'idle link contrast').toBeGreaterThanOrEqual(4.5)
      expect(active, 'active link contrast').toBeGreaterThanOrEqual(4.5)
      expect(underline, 'active underline contrast').toBeGreaterThanOrEqual(3)
    })
  }
})
