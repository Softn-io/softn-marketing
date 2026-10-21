/**
 * Replaces every `{name}` placeholder of a locale string with the matching value.
 * Throws when a placeholder has no value, so a missing parameter fails at build or test time
 * instead of shipping a literal `{name}` to visitors.
 */
export const interpolate = (template: string, values: Readonly<Record<string, string>>): string => {
  return template.replace(/\{(\w+)\}/g, (_placeholder, name: string) => {
    const value = values[name]
    if (value === undefined) {
      throw new Error(`Missing interpolation value for "{${name}}" in "${template}"`)
    }
    return value
  })
}
