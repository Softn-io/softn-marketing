/**
 * E2E coverage for the Agent section's visual shell (GitHub issue #15).
 *
 * The unit tests (`components/sections/Agent/tests/`) prove the markup contract. What only a real
 * browser can prove is covered here, on `/preview` served with `ENABLE_PREVIEW_ROUTE=true` (see
 * `playwright.config.ts`):
 *
 * - The section renders after the Method section in document order, with its single h2, the two
 *   static welcome messages grouped under one speaker line, the typing indicator, the
 *   suggested-question chips, the labelled input and the send button.
 * - The heading order stays h1 → h2 (no h3 inside the section) and the section is a region named
 *   by its heading.
 * - Keyboard: the input, the send button and the chips take focus, in DOM order. The input's
 *   focus indicator is the composer underline turning --softn-input-border-focus (≥3:1), no ring;
 *   the send button and the chips keep a visible 2px focus outline.
 * - Contrast: chip, booking chip, placeholder, speaker, message, scope note and eyebrow text keep
 *   WCAG 2.1 AA on the section's opaque background, in both themes; the send button's border
 *   (--softn-border-active) and the focused composer underline keep ≥3:1.
 * - The method timeline parallax writes the design's transform and opacity while the agent
 *   section enters (60px, 0.94, 0.45), and writes nothing under `prefers-reduced-motion: reduce`.
 * - Reduced motion also stops the shell's own ambient animations, typing bounce and hover shift.
 * - No third-party request fires (the shell makes none, and nothing else starts before consent).
 * - Token fidelity: every computed color, font, spacing, radius and shadow value on the key
 *   elements is a value of a `@softnio-labs/tokens` token (4a-1, values from the package source
 *   `node_modules/@softnio-labs/tokens/`, version 0.3.1).
 */
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { SECTION_IDS } from '../lib/anchors'
import { agent } from '../locales/fr/agent'
import { ASSISTANT_NAME, chatbot } from '../locales/fr/chatbot'

const AGENT_ID = SECTION_IDS.agent
const METHOD_ID = SECTION_IDS.method
const TIMELINE_ID = 'method-timeline'

const filled = (template: string): string => template.replaceAll('{assistantName}', ASSISTANT_NAME)

const agentSection = (page: Page) => page.locator(`section#${AGENT_ID}`)
const timeline = (page: Page) => page.locator(`#${TIMELINE_ID}`)

/** Resolves once the browser has had a frame to apply the current scroll position. */
const nextFrame = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))

/** Absolute document top of the agent section, read in one pass. */
const agentDocumentTop = (page: Page): Promise<number> =>
  page.evaluate((id) => document.getElementById(id)!.getBoundingClientRect().top + window.scrollY, AGENT_ID)

/** WCAG 2.1 relative-luminance contrast, foreground composited over the background by the canvas. */
const contrastRatio = (page: Page, foreground: string, background: string): Promise<number> =>
  page.evaluate(
    ([fg, bg]: [string, string]) => {
      const compositedPixel = (): [number, number, number] => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const context = canvas.getContext('2d')
        if (context === null) throw new Error('no 2d context')
        context.fillStyle = bg // opaque or resolved background first
        context.fillRect(0, 0, 1, 1)
        context.fillStyle = fg // translucent foregrounds composite over it, like the page does
        context.fillRect(0, 0, 1, 1)
        const data = context.getImageData(0, 0, 1, 1).data
        return [data[0]!, data[1]!, data[2]!]
      }
      const backgroundPixel = (): [number, number, number] => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const context = canvas.getContext('2d')
        if (context === null) throw new Error('no 2d context')
        context.fillStyle = bg
        context.fillRect(0, 0, 1, 1)
        const data = context.getImageData(0, 0, 1, 1).data
        return [data[0]!, data[1]!, data[2]!]
      }
      const luminance = ([r, g, b]: [number, number, number]) => {
        const channel = (value: number) => {
          const s = value / 255
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
      }
      const l1 = luminance(compositedPixel())
      const l2 = luminance(backgroundPixel())
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    },
    [foreground, background] as [string, string],
  )

/** True when two CSS colors resolve to the same pixel (serialization-proof comparison). */
const sameColor = (page: Page, left: string, right: string): Promise<boolean> =>
  page.evaluate(
    ([a, b]: [string, string]) => {
      const pixel = (color: string): string => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const context = canvas.getContext('2d')
        if (context === null) throw new Error('no 2d context')
        context.clearRect(0, 0, 1, 1)
        context.fillStyle = color
        context.fillRect(0, 0, 1, 1)
        return `${context.getImageData(0, 0, 1, 1).data}`
      }
      return pixel(a) === pixel(b)
    },
    [left, right] as [string, string],
  )

/** Resolved value of a --softn-* token for the current theme (custom properties compute their var() chain). */
const tokenValue = (page: Page, name: string): Promise<string> =>
  page.evaluate((tokenName) => getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim(), name)

/** One computed-style read on the key agent elements, in one pass. */
type AgentStyles = {
  section: {
    backgroundColor: string
    radiusTopLeft: number
    radiusTopRight: number
    paddingTop: number
    paddingRight: number
    boxShadow: string
  }
  title: { fontFamily: string; fontSize: number; fontWeight: number; letterSpacing: string; lineHeight: number }
  speaker: { color: string; fontSize: number; fontWeight: number; letterSpacing: string }
  messageText: { color: string; fontSize: number; fontWeight: number; maxWidth: number }
  eyebrow: { color: string; fontSize: number }
  statusDot: { width: number; backgroundColor: string }
  chip: { color: string; fontSize: number; lineHeight: number; paddingBottom: number; borderBottomColor: string }
  bookingChip: { color: string; fontWeight: number; fontSize: number; borderBottomColor: string }
  chips: { rowGap: number; columnGap: number }
  scopeNote: { color: string; fontSize: number }
  composer: { borderBottomColor: string }
  input: { color: string; fontSize: number; placeholderColor: string }
  send: { width: number; height: number; borderRadius: number; color: string; borderColor: string }
  typingDot: { width: number; backgroundColor: string }
}

const readAgentStyles = (page: Page): Promise<AgentStyles> =>
  page.evaluate((id) => {
    const px = (value: string): number => Number.parseFloat(value)
    const section = document.getElementById(id)
    if (section === null) throw new Error('agent section missing')
    const sectionStyle = getComputedStyle(section)
    const title = section.querySelector<HTMLElement>('h2')!
    const speaker = section.querySelector<HTMLElement>('li p')!
    // The speaker line sits once above its run of messages: the first message li under it.
    const messageList = speaker.nextElementSibling as HTMLElement
    const messageText = messageList.querySelector<HTMLElement>('li') as HTMLElement
    const eyebrow = section.querySelector<HTMLElement>('p')!
    const statusDot = eyebrow.querySelector<HTMLElement>('span')!
    const chipsList = section.querySelector<HTMLElement>('ul')!
    const chipsStyle = getComputedStyle(chipsList)
    const chip = chipsList.querySelector<HTMLElement>('button')!
    const bookingChip = section.querySelector<HTMLElement>('ul li button[data-suggestion="book"]')!
    const input = section.querySelector<HTMLElement>('input')!
    const composer = input.parentElement as HTMLElement
    const send = section.querySelector<HTMLElement>('input + button')!
    const typingDot = section.querySelector<HTMLElement>('[role="img"] span')!
    const scopeNoteId = input.getAttribute('aria-describedby')
    const scopeNote = scopeNoteId === null ? null : document.getElementById(scopeNoteId)
    const inputStyle = getComputedStyle(input)
    return {
      section: {
        backgroundColor: sectionStyle.backgroundColor,
        radiusTopLeft: px(sectionStyle.borderTopLeftRadius),
        radiusTopRight: px(sectionStyle.borderTopRightRadius),
        paddingTop: px(sectionStyle.paddingTop),
        paddingRight: px(sectionStyle.paddingRight),
        boxShadow: sectionStyle.boxShadow,
      },
      title: {
        fontFamily: getComputedStyle(title).fontFamily,
        fontSize: px(getComputedStyle(title).fontSize),
        fontWeight: Number(getComputedStyle(title).fontWeight),
        letterSpacing: getComputedStyle(title).letterSpacing,
        lineHeight: px(getComputedStyle(title).lineHeight) / px(getComputedStyle(title).fontSize),
      },
      speaker: {
        color: getComputedStyle(speaker).color,
        fontSize: px(getComputedStyle(speaker).fontSize),
        fontWeight: Number(getComputedStyle(speaker).fontWeight),
        letterSpacing: getComputedStyle(speaker).letterSpacing,
      },
      messageText: {
        color: getComputedStyle(messageText).color,
        fontSize: px(getComputedStyle(messageText).fontSize),
        fontWeight: Number(getComputedStyle(messageText).fontWeight),
        maxWidth: px(getComputedStyle(messageText).maxWidth),
      },
      eyebrow: { color: getComputedStyle(eyebrow).color, fontSize: px(getComputedStyle(eyebrow).fontSize) },
      statusDot: {
        width: px(getComputedStyle(statusDot).width),
        backgroundColor: getComputedStyle(statusDot).backgroundColor,
      },
      chip: {
        color: getComputedStyle(chip).color,
        fontSize: px(getComputedStyle(chip).fontSize),
        lineHeight: px(getComputedStyle(chip).lineHeight) / px(getComputedStyle(chip).fontSize),
        paddingBottom: px(getComputedStyle(chip).paddingBottom),
        borderBottomColor: getComputedStyle(chip).borderBottomColor,
      },
      bookingChip: {
        color: getComputedStyle(bookingChip).color,
        fontWeight: Number(getComputedStyle(bookingChip).fontWeight),
        fontSize: px(getComputedStyle(bookingChip).fontSize),
        borderBottomColor: getComputedStyle(bookingChip).borderBottomColor,
      },
      chips: { rowGap: px(chipsStyle.rowGap), columnGap: px(chipsStyle.columnGap) },
      scopeNote: {
        color: scopeNote === null ? '' : getComputedStyle(scopeNote).color,
        fontSize: scopeNote === null ? 0 : px(getComputedStyle(scopeNote).fontSize),
      },
      composer: { borderBottomColor: getComputedStyle(composer).borderBottomColor },
      input: {
        color: inputStyle.color,
        fontSize: px(inputStyle.fontSize),
        placeholderColor: getComputedStyle(input, '::placeholder').color,
      },
      send: {
        width: px(getComputedStyle(send).width),
        height: px(getComputedStyle(send).height),
        borderRadius: px(getComputedStyle(send).borderRadius),
        color: getComputedStyle(send).color,
        borderColor: getComputedStyle(send).borderColor,
      },
      typingDot: {
        width: px(getComputedStyle(typingDot).width),
        backgroundColor: getComputedStyle(typingDot).backgroundColor,
      },
    }
  }, AGENT_ID)

/* --- 4a-1: values of the @softnio-labs/tokens package (0.3.1), read from its source files. --- */
const PACKAGE_SPACES = [0, 4, 8, 16, 20, 24, 32, 40, 48, 64, 80, 96]
const PACKAGE_SIZES = [32, 36, 44, 52, 5]
const PACKAGE_RADII = [8, 16, 24, 100]
const PACKAGE_FONT_SIZES = [48, 36, 24, 20, 18, 16, 14, 12, 11]
const PACKAGE_FONT_WEIGHTS = [400, 500, 600, 700, 800]

test.describe('agent shell: rendering and order', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('renders after Method with its h2, welcome messages, typing indicator, chips, input and send', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' })
    await page.goto('/preview')
    await expect(agentSection(page)).toBeVisible()
    await page.evaluate(() => document.fonts.ready)

    const order = await page.evaluate(
      ([agentId, methodId]) => {
        const agentSectionElement = document.getElementById(agentId)
        const methodSection = document.getElementById(methodId)
        if (agentSectionElement === null || methodSection === null) throw new Error('section missing')
        return {
          followsMethod:
            (methodSection.compareDocumentPosition(agentSectionElement) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
          h2: agentSectionElement.querySelectorAll('h2').length,
          deeperHeadings: agentSectionElement.querySelectorAll('h3, h4, h5, h6').length,
          // The two welcome messages are the li elements of the speaker's run of messages.
          messages: agentSectionElement.querySelectorAll('ol li ol li').length,
          speakerLabels: agentSectionElement.querySelectorAll('ol li > p').length,
          chips: agentSectionElement.querySelectorAll('ul li button').length,
          input: agentSectionElement.querySelectorAll('input').length,
          send: agentSectionElement.querySelectorAll('input + button[type="button"]').length,
          forms: agentSectionElement.querySelectorAll('form').length,
        }
      },
      [AGENT_ID, METHOD_ID] as [string, string],
    )
    expect(order.followsMethod, 'the agent section follows the method section').toBe(true)
    expect(order.h2, 'one section h2').toBe(1)
    expect(order.deeperHeadings, 'no heading below h2').toBe(0)
    expect(order.messages, 'two welcome messages').toBe(2)
    expect(order.speakerLabels, 'one speaker line above the run').toBe(1)
    expect(order.chips, 'one chip per suggestion').toBe(Object.values(chatbot.suggestions).length)
    expect(order.input, 'one question input').toBe(1)
    expect(order.send, 'one type=button send').toBe(1)
    expect(order.forms, 'no form: the shell does not submit').toBe(0)

    const h2 = agentSection(page).getByRole('heading', { level: 2 })
    await expect(h2).toHaveText(filled(agent.title))

    // The speaker line renders once above the run of consecutive assistant messages.
    await expect(page.getByText(filled(agent.speaker.assistant), { exact: true })).toHaveCount(1)
    await expect(page.getByText(filled(agent.speaker.assistant))).toHaveText(filled(agent.speaker.assistant))

    // The typing indicator is an image role with its accessible label.
    await expect(page.getByRole('img', { name: filled(chatbot.typing.ariaLabel) })).toBeVisible()

    // The chips are one labelled group.
    const chips = page.getByRole('list', { name: chatbot.suggestionsLabel })
    await expect(chips).toBeVisible()
    for (const suggestion of Object.values(chatbot.suggestions)) {
      await expect(chips.getByRole('button', { name: suggestion })).toBeVisible()
    }

    // The composer is labelled and its send button is named.
    const input = page.getByRole('textbox', { name: agent.inputLabel })
    await expect(input).toBeVisible()
    await expect(input).toHaveAttribute('placeholder', agent.inputPlaceholder)
    await expect(page.getByRole('button', { name: agent.sendLabel })).toBeVisible()
  })

  test('keeps the page heading order h1 > h2 with no skipped level', async ({ page }) => {
    await page.goto('/preview')
    const levels = await page.evaluate(() =>
      Array.from(document.querySelectorAll('main h1, main h2, main h3')).map((heading) => ({
        level: Number(heading.tagName.slice(1)),
        inAgent: heading.closest('section#assistant') !== null,
      })),
    )
    expect(levels[0], 'the page starts with its h1').toEqual({ level: 1, inAgent: false })
    expect(
      levels.filter((heading) => heading.inAgent),
      'the agent section holds only its h2',
    ).toEqual([{ level: 2, inAgent: true }])
    let previous = 0
    for (const heading of levels) {
      expect(heading.level, 'no level is skipped between consecutive headings').toBeLessThanOrEqual(previous + 1)
      previous = heading.level
    }
  })

  test('is a region named by its heading', async ({ page }) => {
    await page.goto('/preview')
    await expect(page.getByRole('region', { name: filled(agent.title) })).toBeVisible()
  })
})

test.describe('agent shell: keyboard and focus', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('focuses input → send with the underline focus indicator and a visible 2px outline on the other controls', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' })
    await page.goto('/preview')
    await expect(agentSection(page)).toBeVisible()
    const input = page.getByRole('textbox', { name: agent.inputLabel })
    await input.focus()

    // The input shows no ring: its focus indicator is the composer underline. (Chromium reports
    // the shorthand's initial outline-width (medium, 3px) even when outline-style is none — the
    // style, not the width, is what renders a ring.)
    const focused = await input.evaluate((element) => {
      const composer = element.parentElement as HTMLElement
      const inputStyle = getComputedStyle(element)
      return {
        outlineStyle: inputStyle.outlineStyle,
        composerBorderBottomColor: getComputedStyle(composer).borderBottomColor,
      }
    })
    expect(focused.outlineStyle, 'the input shows no ring on focus').toBe('none')

    const styles = await readAgentStyles(page)
    const background = styles.section.backgroundColor
    // The composer's 120ms border-color transition is still running right after focus(): the read
    // above catches an intermediate translucent violet. Wait for the underline to land on its
    // focus token (canvas-pixel compare), then measure the settled color's contrast.
    const focusToken = await tokenValue(page, '--softn-input-border-focus')
    await expect
      .poll(
        async () => {
          const color = await input.evaluate((element) => {
            const composer = element.parentElement as HTMLElement
            return getComputedStyle(composer).borderBottomColor
          })
          return sameColor(page, color, focusToken)
        },
        { timeout: 2_000 },
      )
      .toBe(true)
    const settled = await input.evaluate((element) => {
      const composer = element.parentElement as HTMLElement
      return getComputedStyle(composer).borderBottomColor
    })
    expect(
      await contrastRatio(page, settled, background),
      'the focused composer underline keeps WCAG 1.4.11 non-text contrast (≥3:1)',
    ).toBeGreaterThanOrEqual(3)

    // Keyboard order: Tab leaves the input and reaches the send button next.
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: agent.sendLabel })).toBeFocused()

    // The send button and the chips keep their visible 2px focus outline.
    const send = page.getByRole('button', { name: agent.sendLabel })
    const sendOutline = await send.evaluate((element) => {
      const style = getComputedStyle(element)
      return { width: style.outlineWidth, style: style.outlineStyle, offset: style.outlineOffset }
    })
    expect(sendOutline, 'the send button keeps its focus ring on :focus-visible').toEqual({
      width: '2px',
      style: 'solid',
      offset: '2px',
    })
    const chip = agentSection(page).getByRole('button', { name: chatbot.suggestions.process })
    await chip.focus()
    const chipOutline = await chip.evaluate((element) => {
      const style = getComputedStyle(element)
      return { width: style.outlineWidth, style: style.outlineStyle, offset: style.outlineOffset }
    })
    expect(chipOutline, 'the chip shows its focus ring on :focus-visible').toEqual({
      width: '2px',
      style: 'solid',
      offset: '2px',
    })
  })
})

test.describe('agent shell: contrast', () => {
  const expectContrast = async (page: Page): Promise<void> => {
    const styles = await readAgentStyles(page)
    const background = styles.section.backgroundColor
    expect(
      await contrastRatio(page, styles.chip.color, background),
      `chip text (${styles.chip.fontSize}px)`,
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      await contrastRatio(page, styles.bookingChip.color, background),
      `booking chip text (${styles.bookingChip.fontSize}px)`,
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      await contrastRatio(page, styles.bookingChip.borderBottomColor, background),
      'booking chip underline',
    ).toBeGreaterThanOrEqual(3)
    expect(
      await contrastRatio(page, styles.input.placeholderColor, background),
      `placeholder text (${styles.input.fontSize}px)`,
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      await contrastRatio(page, styles.speaker.color, background),
      `speaker line (${styles.speaker.fontSize}px)`,
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      await contrastRatio(page, styles.messageText.color, background),
      `message text (${styles.messageText.fontSize}px)`,
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      await contrastRatio(page, styles.scopeNote.color, background),
      `scope note (${styles.scopeNote.fontSize}px)`,
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      await contrastRatio(page, styles.eyebrow.color, background),
      `eyebrow text (${styles.eyebrow.fontSize}px)`,
    ).toBeGreaterThanOrEqual(4.5)
    // Non-text UI: the send icon (the affordance that names the button) and its boundary need 3:1.
    // The border sits on --softn-border-active (opaque violet500 dark / violet700 light), which
    // keeps 4.6:1 dark and 6.5:1 light on the section background.
    expect(await contrastRatio(page, styles.send.color, background), 'send icon color').toBeGreaterThanOrEqual(3)
    expect(await contrastRatio(page, styles.send.borderColor, background), 'send button border').toBeGreaterThanOrEqual(
      3,
    )
  }

  test.use({ viewport: { width: 1280, height: 800 } })

  test('keeps AA contrast in the dark theme', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' })
    await page.goto('/preview')
    await expect(agentSection(page)).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await expectContrast(page)
  })

  test('keeps AA contrast in the light theme', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' })
    await page.goto('/preview')
    await expect(agentSection(page)).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await expectContrast(page)
  })

  test('passes an axe scan scoped to the section, on desktop and mobile', async ({ page }) => {
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 375, height: 667 },
    ]) {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
      await page.goto('/preview')
      await expect(agentSection(page)).toBeVisible()
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag21a', 'wcag21aa'])
        .include(`#assistant`)
        .analyze()
      expect(results.violations, `axe on #assistant at ${viewport.width}px`).toEqual([])
    }
  })
})

test.describe('agent shell: booking chip emphasis', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('emphasises the booking chip with the brand-foreground text and the brand-vivid underline, stronger on hover', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' })
    await page.goto('/preview')
    await expect(agentSection(page)).toBeVisible()
    await page.evaluate(() => document.fonts.ready)

    const booking = agentSection(page).getByRole('button', { name: chatbot.suggestions.book })
    const question = agentSection(page).getByRole('button', { name: chatbot.suggestions.process })
    await expect(booking).toBeVisible()
    await expect(question).toBeVisible()

    const rest = await booking.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        color: style.color,
        fontWeight: Number(style.fontWeight),
        borderBottomColor: style.borderBottomColor,
      }
    })
    expect(rest.fontWeight, 'the booking chip uses the small-title weight (600)').toBe(600)
    expect(
      await sameColor(page, rest.color, await tokenValue(page, '--softn-brand-foreground')),
      'the booking chip text is --softn-brand-foreground',
    ).toBe(true)
    expect(
      await sameColor(page, rest.borderBottomColor, await tokenValue(page, '--softn-brand-vivid')),
      'the booking chip underline is --softn-brand-vivid',
    ).toBe(true)

    // The question chips keep their own look: secondary text on the default border.
    const questionStyle = await question.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        color: style.color,
        fontWeight: Number(style.fontWeight),
        borderBottomColor: style.borderBottomColor,
      }
    })
    expect(
      await sameColor(page, questionStyle.color, await tokenValue(page, '--softn-color-secondary')),
      'the question chip text is --softn-color-secondary',
    ).toBe(true)
    expect(
      await sameColor(page, questionStyle.borderBottomColor, await tokenValue(page, '--softn-border-default')),
      'the question chip underline is --softn-border-default',
    ).toBe(true)

    // Hover strengthens the underline and lifts the label to full-strength text. (Canvas pixel
    // comparison, not string equality: Chromium serializes computed token colors as lab(...) on
    // the element but as lab(...%) through the custom property.)
    const brandForegroundToken = await tokenValue(page, '--softn-brand-foreground')
    const colorToken = await tokenValue(page, '--softn-color')
    await booking.hover()
    await expect
      .poll(
        async () => {
          const hovered = await booking.evaluate((element) => {
            const style = getComputedStyle(element)
            return { color: style.color, borderBottomColor: style.borderBottomColor }
          })
          return (
            (await sameColor(page, hovered.borderBottomColor, brandForegroundToken)) &&
            (await sameColor(page, hovered.color, colorToken))
          )
        },
        { timeout: 2_000 },
      )
      .toBe(true)
  })
})

test.describe('agent shell: scope note', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('renders the scope note under the composer as the input description', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' })
    await page.goto('/preview')
    await expect(agentSection(page)).toBeVisible()

    const input = page.getByRole('textbox', { name: agent.inputLabel })
    const noteId = await input.getAttribute('aria-describedby')
    expect(noteId, 'the input is described by the scope note').toBeTruthy()
    const note = page.locator(`#${noteId}`)
    await expect(note).toBeVisible()
    await expect(note).toHaveText(filled(agent.scopeNote))

    // The note renders after the composer, under it, in DOM order.
    const order = await page.evaluate(
      ([sectionId, noteId]) => {
        const section = document.getElementById(sectionId)
        const note = noteId === null ? null : document.getElementById(noteId)
        if (section === null || note === null) throw new Error('section or note missing')
        const composer = section.querySelector('input')!.parentElement!
        return {
          noteFollowsComposer: (composer.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
        }
      },
      [AGENT_ID, noteId] as [string, string],
    )
    expect(order.noteFollowsComposer, 'the scope note renders after the composer').toBe(true)
  })
})

test.describe('agent shell: reduced motion', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('stops the shell ambient animations and the hover shift under prefers-reduced-motion: reduce', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
    await page.goto('/preview')
    await expect(agentSection(page)).toBeVisible()

    // The status dot, the glow and the typing dots hold no ambient animation.
    const animations = await page.evaluate((sectionId) => {
      const section = document.getElementById(sectionId)
      if (section === null) throw new Error('agent section missing')
      const statusDot = section.querySelector('p > span')
      const glow = section.querySelector(':scope > div[aria-hidden="true"]')
      const typingDot = section.querySelector('[role="img"] span')
      const animationName = (element: Element | null) =>
        element === null ? null : getComputedStyle(element).animationName
      return {
        statusDot: animationName(statusDot),
        glow: animationName(glow),
        typingDot: animationName(typingDot),
      }
    }, AGENT_ID)
    expect(animations.glow, 'the glow animation is off under reduced motion').toBe('none')
    expect(animations.statusDot, 'the status dot animation is off under reduced motion').toBe('none')
    expect(animations.typingDot, 'the typing dots animation is off under reduced motion').toBe('none')

    // The hover shift is also off: the arrow stays in place.
    const send = page.getByRole('button', { name: agent.sendLabel })
    await send.hover()
    await expect
      .poll(async () => send.evaluate((element) => getComputedStyle(element).transform), { timeout: 2_000 })
      .toBe('none')
  })
})

test.describe('agent shell: timeline parallax', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('moves the timeline with the design amplitudes as the section enters', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' })
    await page.goto('/preview')
    await expect(agentSection(page)).toBeVisible()
    const documentTop = await agentDocumentTop(page)
    const viewportHeight = await page.evaluate(() => window.innerHeight)

    /* The inline state of the timeline and the live progress, read in one pass. */
    const inlineState = async (): Promise<{ translateY: number; scale: number; opacity: number; progress: number }> =>
      page.evaluate(
        ([timelineId, agentId]) => {
          const element = document.getElementById(timelineId) as HTMLElement
          const transform = element.style.transform
          const translateY = Number(/translateY\((-?[0-9.]+)px\)/.exec(transform)?.[1] ?? Number.NaN)
          const scale = Number(/scale\((-?[0-9.]+)\)/.exec(transform)?.[1] ?? Number.NaN)
          const opacity = Number(element.style.opacity)
          const top = document.getElementById(agentId)!.getBoundingClientRect().top
          const progress = Math.min(1, Math.max(0, 1 - top / window.innerHeight))
          return { translateY, scale, opacity, progress }
        },
        [TIMELINE_ID, AGENT_ID] as [string, string],
      )

    // Instant scrolling bypasses the page's smooth scroll-behavior, so each stage lands exactly.
    const scrollTo = (y: number): Promise<void> =>
      page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y)

    // Each stage: the poll waits for the scroll to settle at the landmark progress, then the
    // written values must sit at the documented amplitude and follow the design formula at the
    // measured progress (sub-pixel scroll differences tolerated).
    const expectAtAmplitude = async (expected: {
      progress: number
      translateY: number
      scale: number
      opacity: number
    }): Promise<void> => {
      await expect
        .poll(async () => (await inlineState()).progress, { timeout: 5_000 })
        .toBeCloseTo(expected.progress, 1)
      const state = await inlineState()
      expect(state.translateY, `translateY at progress ${state.progress}`).toBeCloseTo(expected.translateY, 0)
      expect(state.scale, `scale at progress ${state.progress}`).toBeCloseTo(expected.scale, 2)
      expect(state.opacity, `opacity at progress ${state.progress}`).toBeCloseTo(expected.opacity, 2)
      expect(state.translateY).toBeCloseTo(-60 * state.progress, 1)
      expect(state.scale).toBeCloseTo(1 - 0.06 * state.progress, 3)
      expect(state.opacity).toBeCloseTo(1 - 0.55 * state.progress, 2)
    }

    // Not entered: the timeline is untouched (progress 0).
    await scrollTo(Math.max(0, documentTop - viewportHeight))
    await nextFrame(page)
    await expectAtAmplitude({ progress: 0, translateY: 0, scale: 1, opacity: 1 })

    // Halfway: section top at half the viewport (progress 0.5).
    await scrollTo(documentTop - viewportHeight / 2)
    await nextFrame(page)
    await expectAtAmplitude({ progress: 0.5, translateY: -30, scale: 0.97, opacity: 0.725 })

    // Fully entered: section top at the viewport top (progress 1).
    await scrollTo(documentTop)
    await nextFrame(page)
    await expectAtAmplitude({ progress: 1, translateY: -60, scale: 0.94, opacity: 0.45 })

    // Past the entrance: clamped, never further than the design amplitude.
    await scrollTo(documentTop + viewportHeight)
    await nextFrame(page)
    await expectAtAmplitude({ progress: 1, translateY: -60, scale: 0.94, opacity: 0.45 })

    await expect(timeline(page)).toBeVisible()
  })

  test('writes nothing under prefers-reduced-motion: reduce', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
    await page.goto('/preview')
    await expect(agentSection(page)).toBeVisible()
    const documentTop = await agentDocumentTop(page)
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), documentTop)
    await nextFrame(page)
    await nextFrame(page)

    const inline = await page.evaluate((timelineId) => {
      const element = document.getElementById(timelineId) as HTMLElement
      return {
        transform: element.style.transform,
        opacity: element.style.opacity,
        style: element.getAttribute('style'),
      }
    }, TIMELINE_ID)
    expect(inline.transform, 'no transform is written under reduced motion').toBe('')
    expect(inline.opacity, 'no opacity is written under reduced motion').toBe('')
    expect(inline.style, 'no inline style at all').toBeNull()
  })
})

test.describe('agent shell: content and consent', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('fires no third-party request on load and scroll', async ({ page }) => {
    const external: string[] = []
    page.on('request', (request) => {
      if (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
        if (!request.url().startsWith('http://localhost:3100')) {
          external.push(request.url())
        }
      }
    })
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' })
    await page.goto('/preview')
    await expect(agentSection(page)).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await nextFrame(page)
    expect(external, 'no third-party request fires before consent').toEqual([])
  })
})

test.describe('agent shell, mobile', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('keeps the shell readable: title, chips and composer visible', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' })
    await page.goto('/preview')
    await expect(agentSection(page)).toBeVisible()
    await page.evaluate(() => document.fonts.ready)

    // Token fidelity on mobile: the title sits one step down the display scale (36px).
    const styles = await readAgentStyles(page)
    expect(styles.title.fontSize, 'the mobile title is --softn-font-size-display-md').toBe(36)
    expect(PACKAGE_FONT_SIZES).toContain(styles.title.fontSize)

    // The wrapping rhythm uses the increased row gap (space-4), so wrapped chips breathe.
    expect(styles.chips.rowGap, 'the chips row gap is --softn-space-4').toBe(16)
  })
})

test.describe('agent shell: token fidelity (4a-1)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('uses only package token values on the key elements', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' })
    await page.goto('/preview')
    await expect(agentSection(page)).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    const styles = await readAgentStyles(page)

    // Fonts: the package declares `ZalandoSans`/`PlusJakartaSans`; the site self-hosts the same
    // typefaces through next/font/local, which renames the family (`__ZalandoSans_<hash>`) and
    // binds it via `--font-zalando-sans` (app/globals.css). Match on the declared stem.
    expect(/zalando/i.test(styles.title.fontFamily), `display font family: ${styles.title.fontFamily}`).toBe(true)
    expect(
      await page.evaluate(() => {
        const families = Array.from(document.fonts).map((face) => face.family)
        return {
          zalandoLoaded: families.some((family) => /zalando/i.test(family)),
          jakartaLoaded: families.some((family) => /jakarta/i.test(family)),
        }
      }),
      'both declared typefaces are really loaded (next/font scoped names)',
    ).toMatchObject({ zalandoLoaded: true, jakartaLoaded: true })

    // Radius: the approved 24px --softn-radius-xl on both top corners; pill on the send button.
    expect(styles.section.radiusTopLeft, 'section top-left radius is --softn-radius-xl').toBe(24)
    expect(styles.section.radiusTopRight, 'section top-right radius is --softn-radius-xl').toBe(24)
    expect(PACKAGE_RADII).toContain(styles.section.radiusTopLeft)
    expect(PACKAGE_RADII).toContain(styles.send.borderRadius)

    // Size and spacing.
    expect(PACKAGE_SIZES, 'send button is --softn-size-md').toContain(styles.send.width)
    expect(styles.send.height).toBe(styles.send.width)
    expect(styles.statusDot.width, 'status dot is --softn-size-dotIndicator').toBe(5)
    expect(PACKAGE_SIZES).toContain(styles.typingDot.width)
    expect(PACKAGE_SPACES, 'section top padding resolves to a space token at 1280px').toContain(
      Math.round(styles.section.paddingTop),
    )
    expect(PACKAGE_SPACES, 'section inline padding resolves to a space token at 1280px').toContain(
      Math.round(styles.section.paddingRight),
    )
    expect(PACKAGE_SPACES, 'the chips row gap is --softn-space-4').toContain(styles.chips.rowGap)
    expect(PACKAGE_SPACES, 'the chips column gap is --softn-space-6').toContain(styles.chips.columnGap)
    expect(styles.chips.rowGap, 'the chips row gap is --softn-space-4').toBe(16)
    expect(styles.chips.columnGap, 'the chips column gap is --softn-space-6').toBe(24)

    // Typography.
    expect(PACKAGE_FONT_SIZES, 'title font size').toContain(styles.title.fontSize)
    expect(PACKAGE_FONT_WEIGHTS, 'title weight').toContain(styles.title.fontWeight)
    expect(styles.title.lineHeight, 'title line height is the display token (1 at 48px)').toBe(1)
    expect(PACKAGE_FONT_SIZES, 'message font size is --softn-font-size-body-md').toContain(styles.messageText.fontSize)
    expect(styles.messageText.fontSize, 'message text is body-md (16px)').toBe(16)
    expect(PACKAGE_FONT_WEIGHTS, 'message weight').toContain(styles.messageText.fontWeight)
    expect(PACKAGE_FONT_SIZES, 'chip font size is --softn-font-size-body-sm').toContain(styles.chip.fontSize)
    expect(styles.chip.fontSize, 'chip text is body-sm (14px)').toBe(14)
    expect(Math.abs(styles.chip.lineHeight - 1.7), 'chip line height is the body-sm token').toBeLessThan(0.01)
    expect(PACKAGE_FONT_SIZES, 'booking chip font size is --softn-font-size-body-sm').toContain(
      styles.bookingChip.fontSize,
    )
    expect(PACKAGE_FONT_WEIGHTS, 'booking chip weight is --softn-font-weight-title-sm').toContain(
      styles.bookingChip.fontWeight,
    )
    expect(styles.bookingChip.fontWeight, 'booking chip weight is 600').toBe(600)
    expect(PACKAGE_FONT_SIZES, 'scope note font size is --softn-font-size-body-sm').toContain(styles.scopeNote.fontSize)
    expect(styles.scopeNote.fontSize, 'scope note is body-sm (14px)').toBe(14)
    expect(PACKAGE_FONT_SIZES, 'input font size is --softn-font-size-body-lg').toContain(styles.input.fontSize)
    expect(PACKAGE_FONT_SIZES, 'speaker/caption font size is --softn-font-size-caption').toContain(
      styles.speaker.fontSize,
    )
    expect(PACKAGE_FONT_WEIGHTS, 'speaker weight is the caption token').toContain(styles.speaker.fontWeight)
    expect(
      Math.abs(Number.parseFloat(styles.speaker.letterSpacing) - 0.12 * styles.speaker.fontSize),
      'caption letter spacing 0.12em',
    ).toBeLessThan(0.4)

    // The top shadow is the documented fixed geometry with a token colour: it must start upward
    // (negative y offset) and use the package black in the mix, per the approved decision.
    expect(styles.section.boxShadow).toContain('-24px')
    expect(styles.section.boxShadow).toContain('60px')

    // Colors: the speaker line, the booking chip and the question chips carry their own tokens.
    expect(
      await sameColor(page, styles.speaker.color, await tokenValue(page, '--softn-brand-foreground')),
      'speaker line is --softn-brand-foreground',
    ).toBe(true)
    expect(
      await sameColor(page, styles.bookingChip.color, await tokenValue(page, '--softn-brand-foreground')),
      'booking chip text is --softn-brand-foreground',
    ).toBe(true)
    expect(
      await sameColor(page, styles.bookingChip.borderBottomColor, await tokenValue(page, '--softn-brand-vivid')),
      'booking chip underline is --softn-brand-vivid',
    ).toBe(true)
    expect(
      await sameColor(page, styles.chip.color, await tokenValue(page, '--softn-color-secondary')),
      'question chip text is --softn-color-secondary',
    ).toBe(true)
    expect(
      await sameColor(page, styles.scopeNote.color, await tokenValue(page, '--softn-color-tertiary')),
      'scope note is --softn-color-tertiary',
    ).toBe(true)
    expect(
      await sameColor(page, styles.messageText.color, await tokenValue(page, '--softn-color')),
      'message text is --softn-color',
    ).toBe(true)
    expect(
      await sameColor(page, styles.eyebrow.color, await tokenValue(page, '--softn-color-tertiary')),
      'eyebrow text is --softn-color-tertiary',
    ).toBe(true)
    expect(
      await sameColor(page, styles.send.borderColor, await tokenValue(page, '--softn-border-active')),
      'send border is --softn-border-active',
    ).toBe(true)
    expect(
      await sameColor(page, styles.composer.borderBottomColor, await tokenValue(page, '--softn-input-border-default')),
      'the resting composer underline is --softn-input-border-default',
    ).toBe(true)
  })
})
