import { z } from 'zod'
import { readEnv, type Env } from '@/lib/env'

/** Value accepted in a Baserow row: the scalar and multi-value shapes the REST API writes. */
export type BaserowFieldValue = string | number | boolean | readonly string[]

/** Fields of a row to write, keyed by Baserow field name. */
export type BaserowFields = Readonly<Record<string, BaserowFieldValue>>

/** Actual Baserow column type of a field a create must give back unchanged. */
export type BaserowFieldKind = 'text' | 'email' | 'date' | 'date-time' | 'boolean'

/** One field a create must verify, with the comparison its Baserow column type needs. */
export type BaserowFieldCheck = {
  /** Column name, as sent in the write. */
  readonly field: string
  /** Type of the column in the table. */
  readonly kind: BaserowFieldKind
}

/** Arguments of {@link createBaserowRow}. */
export type CreateBaserowRowInput = {
  /** Baserow table id, resolved by the caller from the validated env. */
  tableId: string
  fields: BaserowFields
  /**
   * Fields the create must give back with the value it sent. A misnamed column is accepted by
   * Baserow with a 200 and an empty cell, so the caller names the columns it cannot lose. Left out,
   * nothing is verified and the answer is used as it is.
   */
  verifyFields?: readonly BaserowFieldCheck[]
}

/** Arguments of {@link updateBaserowRow}. */
export type UpdateBaserowRowInput = {
  /** Baserow table id, resolved by the caller from the validated env. */
  tableId: string
  /** Numeric id of the row to update. */
  rowId: number
  /** Fields to change. Fields left out keep the value they hold. */
  fields: BaserowFields
}

/**
 * Non-personal failure codes, mapped to a generic message by the calling Server Action.
 *
 * `schema-mismatch` means Baserow answered a create with a row id, but gave back a verified column
 * without the value that was sent: the row exists and only its cells are incomplete.
 */
export type BaserowError = 'not-configured' | 'request-failed' | 'schema-mismatch'

/**
 * Failure of a Baserow write: its code, plus the numeric status of the upstream answer when one came
 * back. The status is what tells a missing permission from a bad column, and it is never an upstream
 * body: those are never read, because they can echo the submitted values.
 *
 * When `error` is `schema-mismatch`, the create did get a row id and `rowId` carries it, so the caller
 * can keep the row reachable from the event even though its cells are incomplete. That failure never
 * names the column or the value that did not match. The fields stay optional together so a reader
 * that only knows the generic failure shape (the manage route) can keep reading `status`.
 */
export type BaserowFailure = {
  readonly ok: false
  readonly error: BaserowError
  readonly status?: number
  readonly rowId?: number
}

/** Outcome of a Baserow write: the row id, or a failure carrying no upstream detail. */
export type BaserowResult = { readonly ok: true; readonly data: { readonly id: number } } | BaserowFailure

/** Upper bound on a Baserow write: the form must not hang when the API is slow. */
const BASEROW_TIMEOUT_MS = 5000

/**
 * Answer of a row write: the id, plus every other column Baserow echoes, keyed by column name
 * (`?user_field_names=true`). The extra keys stay `unknown`: they are only read back for the fields
 * a caller asks to verify.
 */
const RowResponseSchema = z
  .object({
    id: z.number().int().positive(),
  })
  .passthrough()

/** One write to a Baserow row: where, with which method, and the fields to send. */
type BaserowWriteInput = {
  url: string
  method: 'POST' | 'PATCH'
  fields: BaserowFields
  /** Columns the answer must give back unchanged; a write without it verifies nothing. */
  verifyFields?: readonly BaserowFieldCheck[]
}

/** True when both values are ISO 8601 instants that parse to the same millisecond. */
const isSameInstant = (sent: string, returned: string): boolean => {
  const sentMs = Date.parse(sent)
  const returnedMs = Date.parse(returned)
  return Number.isFinite(sentMs) && Number.isFinite(returnedMs) && sentMs === returnedMs
}

/**
 * True when Baserow gave back the value that was sent for one column.
 *
 * A date with time is compared as an instant: Baserow may return `2026-11-05T09:00:00Z` for a sent
 * `2026-11-05T09:00:00.000Z`. A date without time and every text column are compared as the exact
 * string sent; a boolean as the exact boolean. A missing key, `null` or a value of another type never
 * matches.
 */
const isSameBaserowValue = (check: BaserowFieldCheck, sent: BaserowFieldValue, returned: unknown): boolean => {
  if (check.kind === 'date-time') {
    return typeof sent === 'string' && typeof returned === 'string' && isSameInstant(sent, returned)
  }
  if (check.kind === 'boolean') return sent === returned
  return typeof sent === 'string' && typeof returned === 'string' && sent === returned
}

/**
 * True when every verified column came back with the value that was sent.
 *
 * A field the payload does not name cannot be verified and counts as a mismatch: the caller asked
 * for it, so its absence from the write is a bug on this side, not a valid empty cell.
 */
const areVerifiedFieldsIntact = (
  checks: readonly BaserowFieldCheck[],
  fields: BaserowFields,
  row: Readonly<Record<string, unknown>>,
): boolean =>
  checks.every((check) => {
    const sent = fields[check.field]
    if (sent === undefined) return false
    if (!Object.prototype.hasOwnProperty.call(row, check.field)) return false
    return isSameBaserowValue(check, sent, row[check.field])
  })

/**
 * Runs one write against a Baserow row endpoint and validates its answer.
 *
 * Server-only by convention: it reads the secret token from `lib/env.ts` and must be imported only
 * from Server Actions or other server code. The base URL comes from the validated `BASEROW_API_URL`
 * (https only, Baserow Cloud by default), so a form value can never redirect the token. A missing
 * token returns `not-configured` without a network call, so a build or a preview without the
 * secrets keeps working. The Baserow error body is never read, returned or logged: it can echo the
 * submitted values.
 *
 * When the caller names columns to verify and the answer keeps the row id but loses one of their
 * values, the write returns `schema-mismatch` with that row id: Baserow accepted a misnamed column
 * with a 200 and left the cell empty, so the row exists but is incomplete. The check never reads a
 * value into a failure: the caller only ever sees the code and the id.
 */
const requestBaserow = async ({ url, method, fields, verifyFields }: BaserowWriteInput): Promise<BaserowResult> => {
  let environment: Env
  try {
    environment = readEnv()
  } catch {
    return { ok: false, error: 'not-configured' }
  }

  const token = environment.BASEROW_TOKEN
  if (token === undefined) return { ok: false, error: 'not-configured' }

  try {
    const response = await fetch(url, {
      method,
      headers: {
        // Baserow database tokens use the `Token` scheme, not `Bearer`: they are DRF tokens and
        // the API answers `Bearer` with "Authentication credentials were not provided.".
        Authorization: `Token ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(fields),
      cache: 'no-store',
      signal: AbortSignal.timeout(BASEROW_TIMEOUT_MS),
    })

    if (!response.ok) return { ok: false, error: 'request-failed', status: response.status }

    const payload: unknown = await response.json()
    const parsed = RowResponseSchema.safeParse(payload)
    if (!parsed.success) return { ok: false, error: 'request-failed' }

    if (verifyFields !== undefined && !areVerifiedFieldsIntact(verifyFields, fields, parsed.data)) {
      return { ok: false, error: 'schema-mismatch', rowId: parsed.data.id }
    }

    return { ok: true, data: { id: parsed.data.id } }
  } catch {
    return { ok: false, error: 'request-failed' }
  }
}

/**
 * Creates one row in a Baserow table.
 *
 * Reusable by the waitlist and later forms: the caller passes the table id and the fields, this
 * helper owns the request shape, the timeout and the failure mapping.
 *
 * A caller that cannot lose a value passes `verifyFields`: the create then compares the values
 * Baserow gives back, keyed by column name, with the ones it sent. A misnamed column is accepted by
 * Baserow with a 200 and an empty cell; the create reports it as `schema-mismatch` with the id of the
 * row it did create, so the caller can keep the row reachable and tell Mel. Without the list, the
 * answer is used as it is.
 *
 * @param input Table id, fields of the new row and optional columns to verify.
 * @returns The id of the created row, or a non-personal failure code; a `schema-mismatch` carries the
 *   row id.
 */
export const createBaserowRow = async ({
  tableId,
  fields,
  verifyFields,
}: CreateBaserowRowInput): Promise<BaserowResult> => {
  let apiUrl: string
  try {
    apiUrl = readEnv().BASEROW_API_URL
  } catch {
    return { ok: false, error: 'not-configured' }
  }

  if (tableId === '') return { ok: false, error: 'not-configured' }

  return requestBaserow({
    url: `${apiUrl}/api/database/rows/table/${encodeURIComponent(tableId)}/?user_field_names=true`,
    method: 'POST',
    fields,
    ...(verifyFields === undefined ? {} : { verifyFields }),
  })
}

/**
 * Updates the fields of one existing row in a Baserow table.
 *
 * A `PATCH` leaves every field the caller does not name untouched, which is what lets a reschedule
 * move only the slot, and a cancellation write only the status. A single select field accepts the
 * option name as a plain string (the token of the leads table needs the `update` permission on that
 * table, not only `create`).
 *
 * @param input Table id, row id and fields to change.
 * @returns The id of the updated row, or a non-personal failure code.
 */
export const updateBaserowRow = async ({ tableId, rowId, fields }: UpdateBaserowRowInput): Promise<BaserowResult> => {
  if (tableId === '' || !Number.isInteger(rowId) || rowId <= 0) return { ok: false, error: 'not-configured' }

  let apiUrl: string
  try {
    apiUrl = readEnv().BASEROW_API_URL
  } catch {
    return { ok: false, error: 'not-configured' }
  }

  return requestBaserow({
    url: `${apiUrl}/api/database/rows/table/${encodeURIComponent(tableId)}/${rowId}/?user_field_names=true`,
    method: 'PATCH',
    fields,
  })
}
