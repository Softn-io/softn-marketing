/**
 * Recoverable outcome of a fallible operation.
 *
 * `lib/assistant` returns this instead of throwing: a caller decides how a failure maps to an
 * error code, and no failure crosses a boundary as an exception.
 */
export type Result<T, E = string> = { ok: true; data: T } | { ok: false; error: E }
