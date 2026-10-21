import { expect, test } from '@playwright/test'
import { HERO_CTA_ID, SECTION_IDS } from '../lib/anchors'

/**
 * QA check 4a-1 (role contract): every computed design value on the key elements must exist
 * as a value of `@softnio-labs/tokens`, in both themes.
 *
 * Method: the browser is the oracle. Each `--softn-*` custom property is applied to a probe
 * element and its *computed* serialization recorded, so oklch/lab/rem-vs-px normalization
 * differences cannot cause false positives or negatives. The probe sits in a container with a
 * sentinel color, so non-color tokens (invalid at computed-value time) cannot leak into the
 * allowed color set.
 *
 * Font families are exempt from the value set: the package publishes the literal family names,
 * the site rebinds them to next/font local files (`app/globals.css` header comment). We assert
 * instead that the loaded faces back the two families the package declares.
 */

type AuditParams = { theme: 'dark' | 'light'; thirdParty: string[]; heroCtaId: string; methodId: string }
/**
 * Typography box of a rendered Button: the type step and weight, the padding and height of the size
 * scale, the face the label is painted in and its line-height as a ratio. The face and the ratio pin
 * the design-system Button contract (`--softn-font-body` at line-height 1, not the display face).
 */
type ButtonSpec = {
  fontSize: number
  fontWeight: string
  paddingInline: string
  minHeight: number
  fontFamily: string
  lineHeightRatio: number
}
type AuditResult = {
  theme: string
  tokenCount: number
  mismatches: string[]
  acceptedFluid: string[]
  fontStacks: string[]
  loadedFontFamilies: string[]
  buttons: { primaryLg: ButtonSpec | null; headerSm: ButtonSpec | null }
  /** First family name of `--softn-font-body` / `--softn-font-display`, as the package publishes them. */
  bodyTokenFamily: string
  displayTokenFamily: string
  /** Control: the face the h1 uses, so a Button pinned to the body face cannot pass by accident. */
  heroH1FontFamily: string
}

/** First family of a `font-family` list, unquoted and lowercased, for a case-insensitive comparison. */
const firstFamily = (stack: string): string =>
  (stack.split(',')[0] ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .toLowerCase()

const auditInPage = ({
  theme,
  thirdParty,
  heroCtaId,
  methodId,
}: AuditParams): AuditResult & { thirdParty: string[] } => {
  // The probe wrapper carries this color so tokens that are not colors (invalid at
  // computed-value time) resolve to it instead of leaking an inherited real color.
  const SENTINEL = 'rgb(1, 2, 3)'
  document.documentElement.setAttribute('data-theme', theme)
  void document.documentElement.offsetHeight

  const num = (v: string): number => Number.parseFloat(v)
  const norm = (v: string): string => v.toLowerCase().replace(/\s+/g, ' ')

  // Accepted deviation (Mel's decision, 2026-10-20; tracked in issue #73, tokenized in 0.3.0): the
  // hero's section rhythm is a clamp interpolating between token bounds. At the 1280x800 audit
  // viewport the hero content container computes padding-top 88px (11vh between --softn-space-16=64px
  // and --softn-space-30=120px) and padding-bottom 96px (--softn-space-24, the 9vw branch clamped at
  // its ceiling). These are not defects but stay reported (annotations).
  const acceptedFluidClamp: Record<string, number[]> = { heroContent: [88, 96] }
  const fluidAccepted: string[] = []

  // 1. Collect every --softn-* name declared anywhere in the stylesheets, plus those active on :root.
  const names = new Set<string>()
  const rootStyle = getComputedStyle(document.documentElement)
  for (const p of Array.from(rootStyle)) if (p.startsWith('--softn-')) names.add(p)
  const walk = (rules: CSSRuleList): void => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        for (const p of Array.from(rule.style)) if (p.startsWith('--softn-')) names.add(p)
      } else if (rule instanceof CSSGroupingRule) {
        walk(rule.cssRules)
      }
    }
  }
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      walk(sheet.cssRules)
    } catch {
      /* unreadable sheet: none should be, but never crash the audit */
    }
  }

  // 2. Resolve each token through the engine into allowed-value sets.
  const colors = new Set<string>([norm('rgba(0, 0, 0, 0)')])
  const lengths = new Set<number>([0])
  const shadows = new Set<string>([norm('none')])
  const weights = new Set<string>()
  const ratios = new Set<number>()
  const spacingLetterRatios = new Set<number>([0])

  const wrapper = document.createElement('div')
  wrapper.style.color = SENTINEL
  document.body.appendChild(wrapper)
  const probe = document.createElement('span')
  probe.style.fontSize = '100px' // px readings below become direct ratios
  wrapper.appendChild(probe)
  const probeStyle = getComputedStyle(probe)

  const resolve = (name: string, depth = 0): string => {
    const raw = rootStyle.getPropertyValue(name).trim()
    if (depth < 4) {
      const inner = /var\((--softn-[a-z0-9-]+)\)/i.exec(raw)
      if (inner?.[1]) return resolve(inner[1], depth + 1)
    }
    return raw
  }

  for (const name of names) {
    const raw = resolve(name)
    if (raw === '') continue

    probe.style.color = `var(${name})`
    const probedColor = norm(probeStyle.color)
    if (probedColor !== SENTINEL) colors.add(probedColor)

    probe.style.boxShadow = `var(${name})`
    const probedShadow = norm(probeStyle.boxShadow)
    if (probedShadow !== 'none') shadows.add(probedShadow)

    probe.style.fontSize = `var(${name})`
    const fs = num(probeStyle.fontSize)
    if (fs !== 100 && Number.isFinite(fs)) lengths.add(Number(fs.toFixed(2)))

    probe.style.borderRadius = `var(${name})`
    const br = num(probeStyle.borderTopLeftRadius)
    if (Number.isFinite(br)) lengths.add(Number(br.toFixed(2)))

    probe.style.padding = `var(${name})`
    for (const p of probeStyle.padding.split(/\s+/)) {
      const v = num(p)
      if (Number.isFinite(v)) lengths.add(Number(v.toFixed(2)))
    }

    if (/font-weight/.test(name)) {
      probe.style.fontWeight = `var(${name})`
      const w = probeStyle.fontWeight
      if (w !== '' && !Number.isNaN(num(w))) weights.add(w)
    }
    if (/line-height|letter-spacing/.test(name)) {
      // Ratios need a known font size: color or length tokens read as invalid font-size would
      // otherwise drop the probe to the inherited 16px and skew the ratio.
      probe.style.fontSize = '100px'
    }
    if (/line-height/.test(name)) {
      probe.style.lineHeight = `var(${name})`
      const lh = num(probeStyle.lineHeight)
      const pf = num(probeStyle.fontSize)
      if (Number.isFinite(lh) && pf > 0) ratios.add(Number((lh / pf).toFixed(3)))
    }
    if (/letter-spacing/.test(name)) {
      probe.style.letterSpacing = `var(${name})`
      const ls = probeStyle.letterSpacing
      if (ls !== 'normal') {
        const v = num(ls)
        const pf = num(probeStyle.fontSize)
        if (Number.isFinite(v) && pf > 0) spacingLetterRatios.add(Number(Math.abs(v / pf).toFixed(4)))
      }
    }

    // reset probe so a stale valid value cannot mask the next invalid var
    probe.style.color = SENTINEL
    probe.style.boxShadow = 'none'
    probe.style.fontSize = '100px'
    probe.style.borderRadius = '0px'
    probe.style.padding = '0px'
    probe.style.fontWeight = '400'
    probe.style.lineHeight = 'normal'
    probe.style.letterSpacing = 'normal'
  }

  const lengthOk = (v: number): boolean => {
    for (const t of lengths) if (Math.abs(t - v) < 0.06) return true
    return false
  }
  const colorOk = (v: string): boolean => colors.has(norm(v))
  const shadowOk = (v: string): boolean => shadows.has(norm(v))

  // 3. Audit the key elements.
  const heroTexts = Array.from(document.querySelectorAll('main section p'))
  const heroLinks = Array.from(document.querySelectorAll('main section a'))
  const elements: Record<string, Element | null> = {
    body: document.body,
    header: document.querySelector('header'),
    logo: document.querySelector("header a[href='/']"),
    navLink: document.querySelector('header nav a'),
    toggle: document.querySelector('header button'),
    cta: document.querySelector("header a[href='#reservation']"),
    main: document.querySelector('main'),
    // Hero (#10): eyebrow, the page h1, subtitle, reassurance, the two CTAs, the indicator, its
    // badge, the content container (section padding) and the section itself.
    heroSection: document.querySelector('main section'),
    heroEyebrow: heroTexts[0] ?? null,
    heroH1: document.querySelector('main h1'),
    heroSubtitle: heroTexts[1] ?? null,
    heroReassurance: heroTexts[2] ?? null,
    heroPrimaryCta: document.getElementById(heroCtaId),
    heroSecondaryCta: heroLinks.find((a) => a.getAttribute('href') === `#${methodId}`) ?? null,
    heroIndicator: heroLinks.at(-1) ?? null,
    heroBadge: document.querySelector('main section a span[aria-hidden="true"]'),
    heroContent: document.getElementById(heroCtaId)?.closest('div')?.parentElement ?? null,
  }

  const mismatches: string[] = []
  const fontStacks = new Set<string>()
  for (const [name, el] of Object.entries(elements)) {
    if (el === null) {
      mismatches.push(`${name}: element missing`)
      continue
    }
    const c = getComputedStyle(el)
    for (const prop of ['color', 'backgroundColor', 'borderTopColor'] as const) {
      const v = c[prop]
      if (v === '' || v === 'none') continue
      if (!colorOk(v)) mismatches.push(`${name}.${prop}: ${v} matches no token`)
    }
    if (!shadowOk(c.boxShadow)) mismatches.push(`${name}.boxShadow: ${c.boxShadow} matches no token`)

    const fams = c.fontFamily
    fontStacks.add(fams)
    for (const fam of fams.split(',')) {
      const clean = fam
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .toLowerCase()
      const known =
        clean === 'sans-serif' ||
        clean === 'serif' ||
        clean === 'system-ui' ||
        clean.startsWith('-apple-system') ||
        /plus.?jakarta|zalando|fallback/i.test(clean)
      if (!known) mismatches.push(`${name}.fontFamily: unexpected family ${fam.trim()}`)
    }

    for (const prop of ['fontSize', 'borderTopLeftRadius'] as const) {
      const v = num(c[prop])
      if (Number.isFinite(v) && !lengthOk(v)) mismatches.push(`${name}.${prop}: ${c[prop]} not in token scale`)
    }
    for (const v of c.padding.split(/\s+/)) {
      const p = num(v)
      if (!Number.isFinite(p) || lengthOk(p)) continue
      if ((acceptedFluidClamp[name] ?? []).includes(p)) {
        fluidAccepted.push(`${name}.padding: ${v} — milieu de clamp entre bornes tokennees (accepté, #73)`)
        continue
      }
      mismatches.push(`${name}.padding: ${v} not in token scale`)
    }
    if (!weights.has(c.fontWeight)) mismatches.push(`${name}.fontWeight: ${c.fontWeight} not a token weight`)
    if (c.lineHeight !== 'normal') {
      const ratio = num(c.lineHeight) / num(c.fontSize)
      const ok = [...ratios].some((r) => Math.abs(r - ratio) < 0.02) || lengthOk(num(c.lineHeight))
      if (!ok) mismatches.push(`${name}.lineHeight: ratio ${ratio.toFixed(3)} not a token line-height`)
    }
    if (c.letterSpacing !== 'normal') {
      const ratio = Math.abs(num(c.letterSpacing) / num(c.fontSize))
      const ok = [...spacingLetterRatios].some((t) => Math.abs(t - ratio) < 0.002) || ratio < 0.0005
      if (!ok) mismatches.push(`${name}.letterSpacing: ${c.letterSpacing} not a token letter-spacing`)
    }
  }
  // Button size contract (loop 1, per the design system's Button SIZES): padding and type step follow
  // the size — lg: body-md 16 px + space-5 (20 px) padding; sm: body-sm 14 px + space-3 (12 px) padding;
  // font-weight 600 on every size, heights from the size scale (size-lg 52 / size-sm 36).
  const readButton = (el: Element | null | undefined): ButtonSpec | null => {
    if (el === null || el === undefined) return null
    const c = getComputedStyle(el)
    const start = num(c.paddingInlineStart)
    const end = num(c.paddingInlineEnd)
    const fontSize = num(c.fontSize)
    // The design system's Button paints the label at line-height 1. Chromium serializes a unitless
    // line-height as the resolved pixel box, so the reading is turned back into a ratio here.
    const lineHeight = c.lineHeight === 'normal' ? fontSize : num(c.lineHeight)
    return {
      fontSize,
      fontWeight: c.fontWeight,
      paddingInline: start === end ? `${start}px` : `${c.paddingInlineStart}/${c.paddingInlineEnd}`,
      minHeight: num(c.minHeight),
      fontFamily: c.fontFamily,
      lineHeightRatio: fontSize > 0 ? Number((lineHeight / fontSize).toFixed(3)) : 0,
    }
  }
  const buttons = { primaryLg: readButton(elements.heroPrimaryCta), headerSm: readButton(elements.cta) }

  wrapper.remove()

  const loaded = new Set<string>()
  document.fonts.forEach((face) => {
    if (face.status === 'loaded' || face.status === 'unloaded') loaded.add(face.family.toLowerCase())
  })

  return {
    theme,
    tokenCount: names.size,
    mismatches,
    acceptedFluid: fluidAccepted,
    fontStacks: [...fontStacks],
    loadedFontFamilies: [...loaded],
    buttons,
    // The package publishes the two family names; the site rebinds the Tailwind utilities to the
    // self-hosted next/font faces (app/globals.css), so the first name of each stack is what the
    // Button and the headings have to agree with.
    bodyTokenFamily: rootStyle.getPropertyValue('--softn-font-body'),
    displayTokenFamily: rootStyle.getPropertyValue('--softn-font-display'),
    heroH1FontFamily: elements.heroH1 ? getComputedStyle(elements.heroH1).fontFamily : '',
    thirdParty,
  }
}

for (const theme of ['dark', 'light'] as const) {
  test(`computed styles match @softnio-labs/tokens values (${theme})`, async ({ browser }, testInfo) => {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      colorScheme: theme,
    })
    const page = await ctx.newPage()
    const external: string[] = []
    page.on('request', (req) => {
      const url = new URL(req.url())
      if (url.hostname !== 'localhost' && !url.hostname.startsWith('127.')) external.push(req.url())
    })
    await page.goto('/')
    await expect(page.locator('header')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    const result = await page.evaluate(auditInPage, {
      theme,
      thirdParty: external,
      heroCtaId: HERO_CTA_ID,
      methodId: SECTION_IDS.method,
    } satisfies AuditParams)

    // Sanity: the audit is meaningless if it collected no tokens.
    expect(result.tokenCount, 'design token custom properties found on the page').toBeGreaterThan(20)
    expect(result.mismatches, `token mismatches (${theme})`).toEqual([])

    // Button size contract: large = body-md 16 px + space-5 padding + size-lg height, small = body-sm
    // 14 px + space-3 padding + size-sm height, weight 600 on both (design-system Button SIZES).
    const { primaryLg, headerSm } = result.buttons
    expect(primaryLg, 'hero primary CTA (Button lg)').not.toBeNull()
    expect(headerSm, 'header booking CTA (Button sm)').not.toBeNull()
    if (primaryLg && headerSm) {
      expect(primaryLg.fontSize, 'Button lg type step (body-md)').toBe(16)
      expect(primaryLg.fontWeight, 'Button lg weight').toBe('600')
      expect(primaryLg.paddingInline, 'Button lg inline padding (space-5)').toBe('20px')
      expect(primaryLg.minHeight, 'Button lg height (size-lg)').toBe(52)
      expect(headerSm.fontSize, 'Button sm type step (body-sm)').toBe(14)
      expect(headerSm.fontWeight, 'Button sm weight').toBe('600')
      expect(headerSm.paddingInline, 'Button sm inline padding (space-3)').toBe('12px')
      expect(headerSm.minHeight, 'Button sm height (size-sm)').toBe(36)

      // Button face and line-height (the loop-2 fix Mel approved): the design system's Button paints
      // the label in the *body* face — `--softn-font-body`, Plus Jakarta Sans — at line-height 1, at
      // every size. A revert to `font-display`, or a label that adds leading, fails here.
      const bodyFace = firstFamily(result.bodyTokenFamily)
      const displayFace = firstFamily(result.displayTokenFamily)
      expect(bodyFace, '--softn-font-body is Plus Jakarta Sans').toMatch(/plus.?jakarta/i)
      expect(displayFace, '--softn-font-display is the display face').toMatch(/zalando/i)
      for (const [label, spec] of [
        ['lg', primaryLg],
        ['sm', headerSm],
      ] as const) {
        expect(firstFamily(spec.fontFamily), `Button ${label} label face`).toBe(bodyFace)
        expect(spec.fontFamily.toLowerCase().includes(displayFace), `Button ${label} uses the display face`).toBe(false)
        expect(spec.lineHeightRatio, `Button ${label} label line-height`).toBe(1)
      }
      // Control: the h1 really does render the display face, so the two pins above cannot both pass
      // because the page collapsed the two families into one.
      expect(firstFamily(result.heroH1FontFamily), 'the h1 keeps the display face').toBe(displayFace)
    }

    for (const accepted of result.acceptedFluid) {
      testInfo.annotations.push({ type: 'accepted-deviation-#73', description: accepted })
    }

    // The package declares both families; faces must exist for each and be used on the page.
    const families = result.loadedFontFamilies.join(' ')
    expect(families).toContain('jakarta')
    expect(families).toContain('zalando')
    expect(result.thirdParty, `no third-party request (${theme})`).toEqual([])

    await ctx.close()
  })
}
