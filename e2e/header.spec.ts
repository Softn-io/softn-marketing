import { expect, test, type Page } from "@playwright/test"

const SKIP_LINK = "Aller au contenu principal"
const BURGER = "Menu de navigation"
const MAIN_NAV = "Navigation principale"
const CTA_LONG = "Réserver mon échange Spark"
const CTA_SHORT = "Réserver mon échange"
const LOGO = "softn.io, retour à l'accueil"

const NAV_LINKS = [
  { label: "Comment je vous aide", aria: "Comment je vous aide, services pour votre activité", id: "services" },
  { label: "Du cadrage au suivi", aria: "Du cadrage au suivi, ma méthode de travail", id: "methode" },
  { label: "Demandez à", aria: "Demandez à", id: "assistant" },
  { label: "En coulisses", aria: "En coulisses, comment ce site a été construit", id: "coulisses" },
  { label: "FAQ", aria: "FAQ, questions fréquentes", id: "faq" },
] as const

const DESKTOP = { width: 1280, height: 800 }
const BELOW_LG = { width: 1023, height: 800 }

const header = (page: Page) => page.locator("header")
/** CSS locator: while the drawer is open the header is aria-hidden, so a role query would not find the burger. */
const burger = (page: Page) => page.locator("header button[aria-expanded]")
const drawer = (page: Page) => page.getByRole("dialog", { name: BURGER })
const themeToggle = (page: Page) => page.getByRole("button", { name: /Passer au mode/ })

/** Accessible name of the element that currently holds focus (aria-label wins over text). */
const focusedName = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement
    if (el === null) return ""
    return el.getAttribute("aria-label") ?? (el as HTMLElement).innerText.trim()
  })

/** Appends one tall section per nav target before hydration so the scroll-spy observes them. */
const injectSections = async (page: Page) => {
  await page.addInitScript(() => {
    const ids = ["services", "methode", "assistant", "coulisses", "faq"]
    document.addEventListener("DOMContentLoaded", () => {
      const wrapper = document.createElement("div")
      wrapper.setAttribute("data-test-sections", "")
      const spacer = document.createElement("div")
      spacer.style.height = "1000px"
      wrapper.append(spacer)
      for (const id of ids) {
        const section = document.createElement("section")
        section.id = id
        section.style.height = "900px"
        section.textContent = id
        wrapper.append(section)
      }
      document.body.append(wrapper)
    })
  })
}

test.describe("header: desktop", () => {
  test.use({ viewport: DESKTOP })

  test("landmarks: one banner, labelled nav, main target of the skip link", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("banner")).toHaveCount(1)
    await expect(page.getByRole("navigation", { name: MAIN_NAV })).toBeVisible()
    await expect(page.locator("main#main")).toHaveCount(1)
    await expect(burger(page)).toBeHidden()
  })

  test("skip link is the first Tab stop, becomes visible and targets #main", async ({ page }) => {
    await page.goto("/")
    const skip = page.getByRole("link", { name: SKIP_LINK })
    await expect(skip).toHaveAttribute("href", "#main")
    // The skip link sits fully above the viewport until it receives focus.
    expect((await skip.boundingBox())?.y ?? 0).toBeLessThan(0)
    await page.keyboard.press("Tab")
    await expect(skip).toBeFocused()
    const box = await skip.boundingBox()
    expect(box).not.toBeNull()
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0)
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/#main$/)
  })

  test("Tab order: skip link, logo, five nav links, theme toggle, CTA", async ({ page }) => {
    await page.goto("/")
    const names: string[] = []
    for (let i = 0; i < 9; i += 1) {
      await page.keyboard.press("Tab")
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

  test("nav accessible names start with the visible text (WCAG 2.5.3)", async ({ page }) => {
    await page.goto("/")
    const links = page.getByRole("navigation", { name: MAIN_NAV }).getByRole("link")
    await expect(links).toHaveCount(5)
    for (let i = 0; i < 5; i += 1) {
      const link = links.nth(i)
      const visible = ((await link.textContent()) ?? "").trim()
      const name = (await link.getAttribute("aria-label")) ?? ""
      expect(visible.length).toBeGreaterThan(0)
      expect(name.startsWith(visible)).toBe(true)
    }
  })

  test("focus is visibly ringed on logo, nav link and CTA", async ({ page }) => {
    await page.goto("/")
    // Tab stops: skip link, logo, 5 nav links, theme toggle, CTA.
    const expected = new Map([[2, "logo"], [3, "nav link"], [9, "CTA"]])
    for (let stop = 1; stop <= 9; stop += 1) {
      await page.keyboard.press("Tab")
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
      const hasRing = (ring.outlineStyle !== "none" && ring.outlineWidth > 0) || ring.boxShadow !== "none"
      expect(hasRing, `${label}: no focus ring ${JSON.stringify(ring)}`).toBe(true)
    }
  })

  test("header stays stuck to the top while scrolling", async ({ page }) => {
    await injectSections(page)
    await page.goto("/")
    await page.evaluate(() => window.scrollTo(0, 1500))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000)
    const top = await header(page).evaluate((el) => el.getBoundingClientRect().top)
    expect(top).toBe(0)
    await expect(page.getByRole("link", { name: CTA_LONG })).toBeVisible()
  })

  test("CTA is visible and not inert while the hero CTA does not exist", async ({ page }) => {
    await page.goto("/")
    const cta = page.getByRole("link", { name: CTA_LONG })
    await expect(cta).toBeVisible()
    await expect(cta.locator("xpath=ancestor::div[@data-state][1]")).toHaveAttribute("data-state", "visible")
  })

  test("CTA click without a listener or section does not throw and sets #reservation", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.goto("/")
    await page.getByRole("link", { name: CTA_LONG }).click()
    await expect(page).toHaveURL(/#reservation$/)
    expect(errors).toEqual([])
  })

  test("in-page links update the URL hash and mark the target section active", async ({ page }) => {
    await injectSections(page)
    await page.goto("/")
    const nav = page.getByRole("navigation", { name: MAIN_NAV })
    await expect(nav.locator("[aria-current]")).toHaveCount(0)
    await nav.getByRole("link", { name: /^Du cadrage au suivi/ }).click()
    await expect(page).toHaveURL(/#methode$/)
    await expect(nav.getByRole("link", { name: /^Du cadrage au suivi/ })).toHaveAttribute("aria-current", "location")
    await expect(nav.locator("[aria-current]")).toHaveCount(1)
  })

  test("scrolling moves the active link with the reading position", async ({ page }) => {
    await injectSections(page)
    await page.goto("/")
    const nav = page.getByRole("navigation", { name: MAIN_NAV })
    await page.evaluate(() => document.getElementById("coulisses")?.scrollIntoView())
    await expect(nav.getByRole("link", { name: /^En coulisses/ })).toHaveAttribute("aria-current", "location")
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(nav.locator("[aria-current]")).toHaveCount(0)
  })
})

test.describe("header: single CTA label per breakpoint", () => {
  test("1279 shows the short label only, 1280 the long one only", async ({ page }) => {
    await page.setViewportSize({ width: 1279, height: 800 })
    await page.goto("/")
    await expect(page.getByRole("link", { name: CTA_SHORT, exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: CTA_LONG })).toHaveCount(0)
    await expect(page.locator("header a[href='#reservation']")).toHaveCount(1)

    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(page.getByRole("link", { name: CTA_LONG })).toBeVisible()
    await expect(page.getByRole("link", { name: CTA_SHORT, exact: true })).toHaveCount(0)
  })
})

test.describe("header: no horizontal overflow", () => {
  for (const width of [1024, 1050, 1100, 1279, 1280]) {
    test(`fits at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto("/")
      await expect(header(page)).toBeVisible()
      const m = await page.evaluate(() => {
        const rect = (el: Element | null) => {
          if (el === null) return null
          const r = el.getBoundingClientRect()
          return { left: r.left, right: r.right, width: r.width, height: r.height }
        }
        const h = document.querySelector("header")
        const nav = document.querySelector("header nav")
        const logo = document.querySelector("header a[aria-label]")
        const actions = h?.lastElementChild ?? null
        const links = Array.from(document.querySelectorAll("header nav a")).map((a) => rect(a))
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
        type: "measure",
        description: `w=${width} logo=${JSON.stringify(m.logo)} nav=${JSON.stringify(m.nav)} actions=${JSON.stringify(m.actions)} headerScroll=${m.headerScroll}/${m.headerClient}`,
      })
      console.log(`[measure] ${width}px`, JSON.stringify(m))
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

test.describe("header: mobile drawer", () => {
  test.use({ viewport: BELOW_LG })

  test("burger replaces the nav below lg and toggles aria-expanded", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("navigation", { name: MAIN_NAV })).toBeHidden()
    await expect(page.locator("header a[href='#reservation']")).toBeHidden()
    const trigger = burger(page)
    await expect(trigger).toBeVisible()
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
    await trigger.click()
    await expect(drawer(page)).toBeVisible()
    await expect(trigger).toHaveAttribute("aria-expanded", "true")
    await page.keyboard.press("Escape")
    await expect(drawer(page)).toBeHidden()
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
  })

  test("Escape closes the drawer and focus returns to the burger", async ({ page }) => {
    await page.goto("/")
    await burger(page).focus()
    await page.keyboard.press("Enter")
    await expect(drawer(page)).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(drawer(page)).toBeHidden()
    await expect(burger(page)).toBeFocused()
  })

  test("first Tab from the close control lands on the first nav link", async ({ page }) => {
    await page.goto("/")
    await burger(page).click()
    await expect(drawer(page)).toBeVisible()
    await page.keyboard.press("Tab")
    await expect(drawer(page).getByRole("navigation").getByRole("link").first()).toBeFocused()
  })

  test("closing control is exposed inside the dialog and header theme toggle is not duplicated", async ({ page }) => {
    await page.goto("/")
    await burger(page).click()
    await expect(drawer(page)).toBeVisible()
    await expect(drawer(page).getByRole("button", { name: BURGER })).toHaveCount(1)
    await expect(drawer(page).getByRole("link", { name: LOGO })).toHaveCount(1)
    // The header sits behind the modal (aria-hidden/inert): the a11y tree holds exactly one logo and one toggle.
    await expect(page.getByRole("link", { name: LOGO })).toHaveCount(1)
    await expect(themeToggle(page)).toHaveCount(1)
    await expect(drawer(page).getByRole("button", { name: /Passer au mode/ })).toHaveCount(1)
  })

  test("initial focus lands on the close control", async ({ page }) => {
    await page.goto("/")
    await burger(page).click()
    await expect(drawer(page)).toBeVisible()
    await expect(drawer(page).getByRole("button", { name: BURGER })).toBeFocused()
  })

  const FOCUS_CYCLE = ["logo", "toggle", "close", "link", "link", "link", "link", "link", "cta"] as const

  /** Classifies the focused element against the dialog content, or "outside" when it is not inside the dialog. */
  const classifyFocus = (page: Page) =>
    page.evaluate(() => {
      const active = document.activeElement
      const dialog = document.querySelector("[role='dialog']")
      if (active !== null && active.hasAttribute("data-base-ui-focus-guard")) return "guard"
      if (active === null || dialog === null || !dialog.contains(active)) return "outside"
      const label = active.getAttribute("aria-label") ?? ""
      if (active.closest("nav") !== null) return "link"
      if (label.startsWith("Passer au mode")) return "toggle"
      if (label === "Menu de navigation") return "close"
      if (active.tagName === "A" && active.getAttribute("href") === "/") return "logo"
      if (active.tagName === "A") return "cta"
      return "outside"
    })

  /** Presses a key, then waits for the focus guard (transient wrap-around stop) to hand focus back to a real element. */
  const pressSettled = async (page: Page, key: string) => {
    await page.keyboard.press(key)
    await expect.poll(() => classifyFocus(page)).not.toBe("guard")
    return classifyFocus(page)
  }

  test("Tab cycles logo, toggle, close, five links, CTA and wraps without leaving the dialog", async ({ page }) => {
    await page.goto("/")
    await burger(page).click()
    await expect(drawer(page)).toBeVisible()
    await expect(drawer(page).getByRole("button", { name: BURGER })).toBeFocused()
    const seen: string[] = []
    // Start on close (initial focus): 6 stops reach the CTA, then 3 more wrap through logo, toggle, close, and one more full loop.
    for (let i = 0; i < FOCUS_CYCLE.length * 2; i += 1) {
      seen.push(await pressSettled(page, "Tab"))
    }
    expect(seen.includes("outside"), `focus left the dialog: ${seen.join(",")}`).toBe(false)
    // DOM order is logo, toggle, close, 5 links, CTA. From close: 5 links, CTA, then wrap to logo, toggle, close.
    expect(seen.slice(0, 9)).toEqual(["link", "link", "link", "link", "link", "cta", "logo", "toggle", "close"])
    expect(seen.slice(9)).toEqual(["link", "link", "link", "link", "link", "cta", "logo", "toggle", "close"])
  })

  test("Shift+Tab cycles in reverse without leaving the dialog", async ({ page }) => {
    await page.goto("/")
    await burger(page).click()
    await expect(drawer(page)).toBeVisible()
    await expect(drawer(page).getByRole("button", { name: BURGER })).toBeFocused()
    const seen: string[] = []
    for (let i = 0; i < FOCUS_CYCLE.length * 2; i += 1) {
      seen.push(await pressSettled(page, "Shift+Tab"))
    }
    expect(seen.includes("outside"), `focus left the dialog: ${seen.join(",")}`).toBe(false)
    // From close in reverse: toggle, logo, wrap to CTA, 5 links, close.
    expect(seen.slice(0, 9)).toEqual(["toggle", "logo", "cta", "link", "link", "link", "link", "link", "close"])
    expect(seen.slice(9)).toEqual(["toggle", "logo", "cta", "link", "link", "link", "link", "link", "close"])
  })

  test("theme toggle inside the popup switches the theme", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("softn-theme", "dark"))
    await page.goto("/")
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
    await burger(page).click()
    await expect(drawer(page)).toBeVisible()
    await drawer(page).getByRole("button", { name: /Passer au mode/ }).click()
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light")
    await expect(drawer(page)).toBeVisible()
  })

  test("no CSP violation or console error while the drawer opens and closes", async ({ page }) => {
    const problems: string[] = []
    page.on("console", (message) => {
      if (message.type() === "error" || /content security policy|refused to/i.test(message.text())) {
        problems.push(message.text())
      }
    })
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        console.error(`CSP violation: ${event.violatedDirective} ${event.blockedURI}`)
      })
    })
    await page.goto("/")
    await burger(page).click()
    await expect(drawer(page)).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(drawer(page)).toBeHidden()
    expect(problems).toEqual([])
  })

  test("drawer lists the five links and a booking CTA", async ({ page }) => {
    await page.goto("/")
    await burger(page).click()
    const dialog = drawer(page)
    // Logo, five section links, CTA.
    await expect(dialog.getByRole("link")).toHaveCount(7)
    await expect(dialog.getByRole("navigation").getByRole("link")).toHaveCount(5)
    await expect(dialog.getByRole("link", { name: CTA_LONG })).toBeVisible()
  })

  test("clicking a link closes the drawer then scrolls to the section", async ({ page }) => {
    await injectSections(page)
    await page.goto("/")
    await burger(page).click()
    await drawer(page).getByRole("link", { name: /^FAQ/ }).click()
    await expect(drawer(page)).toBeHidden()
    await expect(page).toHaveURL(/#faq$/)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000)
  })

  test("clicking the CTA closes the drawer and goes to #reservation", async ({ page }) => {
    await page.goto("/")
    await burger(page).click()
    await drawer(page).getByRole("link", { name: CTA_LONG }).click()
    await expect(drawer(page)).toBeHidden()
    await expect(page).toHaveURL(/#reservation$/)
  })

  test("close control in the burger's spot closes the drawer", async ({ page }) => {
    await page.goto("/")
    await burger(page).click()
    await expect(drawer(page)).toBeVisible()
    await drawer(page).getByRole("button", { name: BURGER }).click()
    await expect(drawer(page)).toBeHidden()
    await expect(burger(page)).toHaveAttribute("aria-expanded", "false")
  })

  test("resizing to desktop closes the drawer", async ({ page }) => {
    await page.goto("/")
    await burger(page).click()
    await expect(drawer(page)).toBeVisible()
    await page.setViewportSize(DESKTOP)
    await expect(drawer(page)).toBeHidden()
    await expect(page.getByRole("navigation", { name: MAIN_NAV })).toBeVisible()
  })

  test("theme toggle stays usable next to the burger", async ({ page }) => {
    await page.goto("/")
    await expect(themeToggle(page)).toBeVisible()
  })

  test("drawer link focus is ringed", async ({ page }) => {
    await page.goto("/")
    await burger(page).click()
    await page.keyboard.press("Tab")
    const first = drawer(page).getByRole("navigation").getByRole("link").first()
    await expect(first).toBeFocused()
    const outline = await first.evaluate((el) => {
      const style = getComputedStyle(el)
      return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) }
    })
    expect(outline.style).not.toBe("none")
    expect(outline.width).toBeGreaterThanOrEqual(2)
  })

  test("reduced motion: drawer opens without travelling transform", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/")
    await burger(page).click()
    const popup = drawer(page)
    await expect(popup).toBeVisible()
    await expect(popup).toHaveCSS("transform", /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/)
    const duration = await popup.evaluate((el) => getComputedStyle(el).transitionProperty)
    expect(duration).not.toContain("transform")
    await page.keyboard.press("Escape")
    await expect(popup).toBeHidden()
  })
})

test.describe("header: drawer top row matches the header", () => {
  for (const width of [375, 768]) {
    for (const scheme of ["dark", "light"] as const) {
      test(`logo, toggle and close sit on their header positions at ${width}px (${scheme})`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 })
        await page.emulateMedia({ colorScheme: scheme })
        await page.addInitScript((value) => localStorage.setItem("softn-theme", value), scheme)
        await page.goto("/")
        await expect(page.locator("html")).toHaveAttribute("data-theme", scheme)
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
                logo: box(scope?.querySelector("a[aria-label]") ?? null),
                toggle: box(scope?.querySelector(t as string) ?? null),
                button: box(
                  scope?.querySelector("button[aria-expanded]") ??
                    scope?.querySelector("button[aria-label='Menu de navigation']") ??
                    null,
                ),
                bg: scope === null ? "" : getComputedStyle(scope).backgroundColor,
              }
            },
            [root, toggle],
          )
        const TOGGLE = "button[aria-label^='Passer au mode']"
        const before = await rects("header", TOGGLE)
        await burger(page).click()
        await expect(drawer(page)).toBeVisible()
        // Wait for the enter transition to finish so the body translate does not skew nothing and opacity is 1.
        await expect(drawer(page)).not.toHaveAttribute("data-starting-style", /.*/)
        await expect.poll(() => drawer(page).evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
        const after = await rects("[role='dialog']", TOGGLE)
        for (const key of ["logo", "toggle", "button"] as const) {
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
        expect(after.bg, "popup background equals header background").toBe(before.bg)
      })
    }
  }

  test("top row stays still while the body travels in (no transform on the bar)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto("/")
    await burger(page).click()
    const bar = drawer(page).locator("> div").first()
    await expect(bar).toHaveCSS("transform", "none")
  })

  test("reduced motion: popup and body carry no transform at any time", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/")
    await burger(page).click()
    const popup = drawer(page)
    await expect(popup).toBeVisible()
    const transforms = await popup.evaluate((el) =>
      Array.from(el.querySelectorAll(":scope > div")).map((child) => {
        const style = getComputedStyle(child)
        return { transform: style.transform, property: style.transitionProperty }
      }),
    )
    for (const item of transforms) {
      expect(item.transform).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/)
      expect(item.property).not.toContain("transform")
    }
  })

  test("swipe down dismisses the drawer (touch emulation)", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 800 }, hasTouch: true, isMobile: true })
    const page = await context.newPage()
    await page.goto("/")
    await burger(page).tap()
    await expect(drawer(page)).toBeVisible()
    const session = await context.newCDPSession(page)
    const x = 200
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", y: number) =>
      session.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y }],
      })
    await touch("touchStart", 300)
    for (let y = 300; y <= 700; y += 50) await touch("touchMove", y)
    await touch("touchEnd", 700)
    await expect(drawer(page)).toBeHidden()
    await context.close()
  })
})

test.describe("header: contrast in both themes", () => {
  test.use({ viewport: DESKTOP })

  const ratioScript = () => {
    const toRgb = (css: string): [number, number, number] => {
      const canvas = document.createElement("canvas")
      canvas.width = 1
      canvas.height = 1
      const ctx = canvas.getContext("2d", { willReadFrequently: true })
      if (ctx === null) throw new Error("no 2d context")
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
    const header = document.querySelector("header") as HTMLElement
    const link = document.querySelector("header nav a") as HTMLElement
    const bg = getComputedStyle(header).backgroundColor
    const idle = ratio(getComputedStyle(link).color, bg)
    link.style.transition = "none"
    link.setAttribute("aria-current", "location")
    const activeStyle = getComputedStyle(link)
    const active = ratio(activeStyle.color, bg)
    const underline = ratio(activeStyle.textDecorationColor, bg)
    link.removeAttribute("aria-current")
    return { idle, active, underline }
  }

  for (const scheme of ["dark", "light"] as const) {
    test(`nav link text >= 4.5:1 and active underline >= 3:1 (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.addInitScript((value) => localStorage.setItem("softn-theme", value), scheme)
      await page.goto("/")
      await expect(page.locator("html")).toHaveAttribute("data-theme", scheme)
      const { idle, active, underline } = await page.evaluate(ratioScript)
      expect(idle, "idle link contrast").toBeGreaterThanOrEqual(4.5)
      expect(active, "active link contrast").toBeGreaterThanOrEqual(4.5)
      expect(underline, "active underline contrast").toBeGreaterThanOrEqual(3)
    })
  }
})
