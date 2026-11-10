import { expect, test, type Page } from '@playwright/test'
import { HERO_CTA_ID, SECTION_IDS, type SectionId } from '../lib/anchors'
import { chatbot } from '../locales/fr/chatbot'
import { nav } from '../locales/fr/hero'

/*
 * QA coverage of the URL-fragment contract (GitHub issue #118): the header scroll spy mirrors the
 * active section into the address bar with `history.replaceState`, and every booking call to action
 * reaches the assistant section even when the fragment already names it — the browser alone would
 * see no hash change and stay where it is.
 *
 * The suite runs on `/preview` like the other specs, against the real sections (hero, offers,
 * method, agent): no section stub is injected, so the fragment always resolves to the element the
 * page really renders.
 */

const DESKTOP = { width: 1280, height: 800 }
const BELOW_LG = { width: 1023, height: 800 }

const CTA_LONG = nav.cta

/** The desktop booking call to action, scoped to its reveal wrapper: the navigation also holds an `#assistant` link. */
const headerCta = (page: Page) => page.locator("header [data-state] a[href='#assistant']")
/** The hero's primary booking call to action. */
const heroCta = (page: Page) => page.locator(`#${HERO_CTA_ID}`)
/** The reservation flow, once a booking call to action has opened it. */
const bookingRegion = (page: Page) => page.getByRole('region', { name: chatbot.suggestions.book })
/** The consent step is the flow's first step: nothing is collected before it. */
const consentAccept = (page: Page) => bookingRegion(page).getByRole('button', { name: chatbot.consent.accept })

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
 * Waits until a section intersects the viewport. Used when the booking flow is open: opening the
 * flow focuses the consent control, and that focus scroll takes the final position over (the
 * booking flow's own scrolling, which issue #118 must not regress), so the exact reading-band
 * position is no longer the click's to guarantee — the section being reached and on screen is.
 */
const expectSectionInView = async (page: Page, id: SectionId): Promise<void> => {
  await expect
    .poll(
      () =>
        page.evaluate((sectionId) => {
          const el = document.getElementById(sectionId)
          if (el === null) throw new Error(`section ${sectionId} missing`)
          const box = el.getBoundingClientRect()
          return box.top < window.innerHeight && box.bottom > 0
        }, id),
      { message: `#${id} must be in view` },
    )
    .toBe(true)
}

/** The URL fragment of the current page, `''` when there is none. */
const urlHash = (page: Page): Promise<string> => {
  const hash = new URL(page.url()).hash
  return Promise.resolve(hash)
}

/**
 * Scrolls the reader to a section the way the visitor would — a wheel gesture, not a programmatic
 * jump — and waits for the URL fragment to name it. The scroll is retried for the same reason
 * `expectAtReadingBand` waits: the page grows under the reader, and the scroll spy syncs the
 * fragment a frame after the reading position settles.
 */
const scrollToSection = async (page: Page, id: SectionId): Promise<void> => {
  const viewport = page.viewportSize() ?? { width: 1280, height: 800 }
  await page.mouse.move(viewport.width / 2, viewport.height / 2)
  await expect
    .poll(
      async () => {
        const delta = Math.round(await sectionOffset(page, id))
        if (Math.abs(delta) > 2) await page.mouse.wheel(0, delta)
        return urlHash(page)
      },
      { message: `the reading position must reach #${id} with the URL naming it` },
    )
    .toBe(`#${id}`)
}

/**
 * Scrolls the hero CTA fully above the viewport, waits for the header CTA to be revealed, then waits
 * for the `sn-pop` reveal to have landed (`opacity: 1`, no `translate`, no `scale`), so the button is
 * clickable and its box is at rest.
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

test.describe('url hash: scroll sync and booking links (issue #118)', () => {
  test.describe('desktop', () => {
    test.use({ viewport: DESKTOP })

    test('clicking a booking button puts #assistant in the URL, reaches the section and opens the consent step', async ({
      page,
    }) => {
      await page.goto('/preview')
      await heroCta(page).click()
      await expect(page).toHaveURL(/#assistant$/)
      await expectSectionInView(page, SECTION_IDS.agent)
      // The booking flow opens on the section, and its first step is the consent: nothing is
      // collected before the visitor accepts it.
      await expect(bookingRegion(page)).toBeVisible()
      await expect(consentAccept(page)).toBeVisible()
    })

    test('scrolling follows the reading position into the URL, the hero removes the fragment, and the sync adds no history entry', async ({
      page,
    }) => {
      await page.goto('/preview')
      await page.evaluate(() => document.fonts.ready)
      const historyLength = await page.evaluate(() => window.history.length)

      await scrollToSection(page, SECTION_IDS.offers)
      await expect(page).toHaveURL(/#services$/)
      await scrollToSection(page, SECTION_IDS.method)
      await expect(page).toHaveURL(/#methode$/)

      // Back to the hero: no section intersects the reading band, the fragment leaves the address.
      await page.evaluate(() => window.scrollTo(0, 0))
      await expect.poll(() => urlHash(page), { message: 'the hero removes the fragment from the URL' }).toBe('')

      // `history.replaceState` only: scrolling through three positions must not fill the back button.
      expect(await page.evaluate(() => window.history.length)).toBe(historyLength)
    })

    test('a booking button reaches the section while the URL still names it and the section is out of view', async ({
      page,
    }) => {
      await page.goto('/preview')
      // Warm the scroll spy up first — a real gesture to a section and back to the hero — so the
      // fragment written below lands after hydration: the spy has no opening fragment to hold and
      // re-apply (that path has its own test), and the state below is deterministic.
      await scrollToSection(page, SECTION_IDS.offers)
      await page.evaluate(() => window.scrollTo(0, 0))
      await expect.poll(() => urlHash(page), { message: 'the hero removes the fragment from the URL' }).toBe('')
      // `replaceState` writes the fragment with no hashchange and no scroll: the URL names
      // `#assistant` while the reader stays at the hero, exactly the state a shared link or a
      // programmatic navigation can leave the page in.
      await page.evaluate(() => window.history.replaceState(null, '', '/preview#assistant'))
      expect(new URL(page.url()).hash).toBe('#assistant')
      const before = await sectionOffset(page, SECTION_IDS.agent)
      expect(Math.abs(before), 'the assistant section is out of view').toBeGreaterThan(2)
      const historyLength = await page.evaluate(() => window.history.length)

      await heroCta(page).click()
      await expectSectionInView(page, SECTION_IDS.agent)
      await expect(page).toHaveURL(/#assistant$/)
      expect(await page.evaluate(() => window.history.length)).toBe(historyLength)
      // The click still asks the assistant to open the flow.
      await expect(consentAccept(page)).toBeVisible()
    })

    test('the issue steps: #assistant in the URL, a scroll away, then a booking button reaches the section again', async ({
      page,
    }) => {
      await page.goto('/preview')
      await heroCta(page).click()
      await expect(page).toHaveURL(/#assistant$/)

      // The flow's consent step renders a beat after the click, and its focused control scrolls
      // itself into view (issue #118 must not regress that focus scroll). When that scroll lands
      // after the suite's next scroll it pulls the page back to the assistant section, and the URL
      // stops naming #services. Let the consent step and its focus scroll land before scrolling
      // away: the steps below assert the URL contract, not the flow's focus timing.
      await expect(consentAccept(page)).toBeVisible()
      await expect
        .poll(async () => {
          const first = await page.evaluate(() => window.scrollY)
          await page.waitForTimeout(120)
          return page.evaluate((y) => window.scrollY === y, first)
        })
        .toBe(true)

      // The reader scrolls elsewhere: the URL follows the section in view.
      await scrollToSection(page, SECTION_IDS.offers)
      await expect(page).toHaveURL(/#services$/)

      // A booking button is a real fragment navigation again: the page scrolls to the section.
      // The hero CTA is far above the viewport now, so the header CTA is already revealed.
      await expect(page.locator('header [data-state]')).toHaveAttribute('data-state', 'visible')
      await headerCta(page).click()
      await expect(page).toHaveURL(/#assistant$/)
      await expectSectionInView(page, SECTION_IDS.agent)
      await expect(consentAccept(page)).toBeVisible()
    })

    test('the desktop booking button works from the keyboard: Tab, Enter, section in view', async ({ page }) => {
      await page.goto('/preview')
      await revealHeaderCta(page)
      // Walk the tab order until the revealed CTA holds focus (skip link, logo, five nav links,
      // theme toggle, then the CTA), and activate it with Enter only.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
      const focusedName = () =>
        page.evaluate(() => {
          const el = document.activeElement
          if (el === null) return ''
          return el.getAttribute('aria-label') ?? (el as HTMLElement).innerText.trim()
        })
      for (let stop = 0; stop < 12 && (await focusedName()) !== CTA_LONG; stop += 1) {
        await page.keyboard.press('Tab')
      }
      await expect(headerCta(page)).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/#assistant$/)
      await expectSectionInView(page, SECTION_IDS.agent)
      await expect(consentAccept(page)).toBeVisible()
    })

    test('reduced motion: the booking scroll is instant', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto('/preview')
      await page.evaluate(() => window.history.replaceState(null, '', '/preview#assistant'))
      // The smooth scroll this page runs otherwise takes several hundred milliseconds over the
      // distance from the hero to the assistant section; a tight window discriminates it from the
      // instant scroll `prefers-reduced-motion: reduce` must produce.
      await heroCta(page).click()
      await expect
        .poll(async () => Math.abs(await sectionOffset(page, SECTION_IDS.agent)), {
          message: 'the section must be at the reading band immediately, with no smooth animation',
          timeout: 300,
        })
        .toBeLessThanOrEqual(2)
      await expect(page).toHaveURL(/#assistant$/)
    })

    test('no regression of the initial-hash handling: /preview#methode lands on the section and keeps its fragment', async ({
      page,
    }) => {
      await page.goto(`/preview#${SECTION_IDS.method}`)
      await expectAtReadingBand(page, SECTION_IDS.method)
      // Once the opening hold releases, the sync must not strip the fragment the visitor asked for.
      await page.waitForTimeout(1_200)
      expect(new URL(page.url()).hash).toBe('#methode')
      // And the spy still follows the reader afterwards.
      await scrollToSection(page, SECTION_IDS.offers)
      await expect(page).toHaveURL(/#services$/)
    })

    test('no regression of the ?rdv=1 key: the flow opens once, the key leaves, the hash stays', async ({ page }) => {
      await page.goto('/preview?rdv=1#assistant')
      await expect(bookingRegion(page)).toBeVisible()
      await expect(consentAccept(page)).toBeVisible()
      expect(new URL(page.url()).search).toBe('')
      expect(new URL(page.url()).hash).toBe('#assistant')
      await expectSectionInView(page, SECTION_IDS.agent)
    })
  })

  test.describe('mobile drawer', () => {
    test.use({ viewport: BELOW_LG })

    test('the drawer booking button closes the drawer, reaches the section and opens the consent step', async ({
      page,
    }) => {
      await page.goto('/preview')
      await page.locator('header button[aria-expanded]').click()
      const drawer = page.getByRole('dialog', { name: nav.menu.ariaLabel })
      await expect(drawer).toBeVisible()
      await drawer.getByRole('link', { name: CTA_LONG }).click()
      await expect(drawer).toBeHidden()
      await expect(page).toHaveURL(/#assistant$/)
      await expectSectionInView(page, SECTION_IDS.agent)
      await expect(consentAccept(page)).toBeVisible()
    })
  })
})
