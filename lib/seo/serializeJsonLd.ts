/**
 * Serializes a JSON-LD payload for an `application/ld+json` block.
 *
 * Every `<` becomes `\u003c`, JSON's own escape for that character: the output stays valid JSON, so
 * a consumer reads the original value back, while a value can never close the surrounding script
 * tag.
 */
export const serializeJsonLd = (data: Record<string, unknown>): string => JSON.stringify(data).replace(/</g, '\\u003c')
