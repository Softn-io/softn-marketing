/*
 * Metadata directives of the contact page.
 *
 * The copy holds the directives as the one string a `<meta name="robots">` carries (`index,
 * follow`); the metadata API takes them as flags, so they are read here rather than spelled out a
 * second time beside the copy.
 */

/** Flags of one `robots` directive string. */
export type ContactRobots = {
  /** Whether search engines may index the page. */
  readonly index: boolean
  /** Whether search engines may follow the links of the page. */
  readonly follow: boolean
}

/**
 * Reads the `robots` directives of the contact page, from the validated copy.
 *
 * Only the positive directives are looked for, so `noindex` and `nofollow` both answer `false`
 * without a special case.
 *
 * @param directives Directive string of the copy, e.g. `index, follow`.
 * @returns The flags the metadata API expects.
 */
export const contactRobots = (directives: string): ContactRobots => {
  const parsed = directives.split(',').map((directive) => directive.trim())
  return { index: parsed.includes('index'), follow: parsed.includes('follow') }
}
