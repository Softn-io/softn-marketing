import { expect, test } from '@playwright/test'

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

type AuditParams = { theme: 'dark' | 'light'; thirdParty: string[] }
type AuditResult = {
  theme: string
  tokenCount: number
  mismatches: string[]
  fontStacks: string[]
  loadedFontFamilies: string[]
}

const auditInPage = ({ theme, thirdParty }: AuditParams): AuditResult & { thirdParty: string[] } => {
  // The probe wrapper carries this color so tokens that are not colors (invalid at
  // computed-value time) resolve to it instead of leaking an inherited real color.
  const SENTINEL = 'rgb(1, 2, 3)'
  document.documentElement.setAttribute('data-theme', theme)
  void document.documentElement.offsetHeight

  const num = (v: string): number => Number.parseFloat(v)
  const norm = (v: string): string => v.toLowerCase().replace(/\s+/g, ' ')

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
  const elements: Record<string, Element | null> = {
    body: document.body,
    header: document.querySelector('header'),
    logo: document.querySelector("header a[href='/']"),
    navLink: document.querySelector('header nav a'),
    toggle: document.querySelector('header button'),
    cta: document.querySelector("header a[href='#reservation']"),
    main: document.querySelector('main'),
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
      if (Number.isFinite(p) && !lengthOk(p)) mismatches.push(`${name}.padding: ${v} not in token scale`)
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
  wrapper.remove()

  const loaded = new Set<string>()
  document.fonts.forEach((face) => {
    if (face.status === 'loaded' || face.status === 'unloaded') loaded.add(face.family.toLowerCase())
  })

  return {
    theme,
    tokenCount: names.size,
    mismatches,
    fontStacks: [...fontStacks],
    loadedFontFamilies: [...loaded],
    thirdParty,
  }
}

for (const theme of ['dark', 'light'] as const) {
  test(`computed styles match @softnio-labs/tokens values (${theme})`, async ({ browser }) => {
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
    const result = await page.evaluate(auditInPage, { theme, thirdParty: external })

    // Sanity: the audit is meaningless if it collected no tokens.
    expect(result.tokenCount, 'design token custom properties found on the page').toBeGreaterThan(20)
    expect(result.mismatches, `token mismatches (${theme})`).toEqual([])

    // The package declares both families; faces must exist for each and be used on the page.
    const families = result.loadedFontFamilies.join(' ')
    expect(families).toContain('jakarta')
    expect(families).toContain('zalando')
    expect(result.thirdParty, `no third-party request (${theme})`).toEqual([])

    await ctx.close()
  })
}
