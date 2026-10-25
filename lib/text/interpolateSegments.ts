/** One piece of an interpolated locale template: literal text, or a resolved `{name}` value. */
export type InterpolationSegment =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'placeholder'; readonly name: string; readonly value: string }

/**
 * Splits a locale template at its `{name}` placeholders and resolves each value, so a component
 * can style one piece (for example bold an e-mail address) while the copy stays a single locale
 * string.
 *
 * Literal text and placeholders come back in template order; empty text pieces are omitted. Like
 * `interpolate`, it throws when a placeholder has no value, so a missing parameter fails at build
 * or test time instead of shipping a literal `{name}` to visitors.
 */
export const interpolateSegments = (
  template: string,
  values: Readonly<Record<string, string>>,
): ReadonlyArray<InterpolationSegment> => {
  const segments: InterpolationSegment[] = []
  let cursor = 0

  for (const match of template.matchAll(/\{(\w+)\}/g)) {
    const name = match[1]
    if (name === undefined) continue

    const value = values[name]
    if (value === undefined) {
      throw new Error(`Missing interpolation value for "{${name}}" in "${template}"`)
    }

    if (match.index > cursor) {
      segments.push({ kind: 'text', value: template.slice(cursor, match.index) })
    }
    segments.push({ kind: 'placeholder', name, value })
    cursor = match.index + match[0].length
  }

  if (cursor < template.length) {
    segments.push({ kind: 'text', value: template.slice(cursor) })
  }

  return segments
}
