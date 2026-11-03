import { z } from 'zod'
import { readEnv, type Env } from '@/lib/env'

/** Value accepted in a Baserow row: the scalar and multi-value shapes the REST API writes. */
export type BaserowFieldValue = string | number | boolean | readonly string[]

/** Fields of a row to write, keyed by Baserow field name. */
export type BaserowFields = Readonly<Record<string, BaserowFieldValue>>

/** Arguments of {@link createBaserowRow}. */
export type CreateBaserowRowInput = {
  /** Baserow table id, resolved by the caller from the validated env. */
  tableId: string
  fields: BaserowFields
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

/** Non-personal failure codes, mapped to a generic message by the calling Server Action. */
export type BaserowError = 'not-configured' | 'request-failed'

/**
 * Failure of a Baserow write: its code, plus the numeric status of the upstream answer when one came
 * back. The status is what tells a missing permission from a bad column, and it is never an upstream
 * body: those are never read, because they can echo the submitted values.
 */
export type BaserowFailure = { readonly ok: false; readonly error: BaserowError; readonly status?: number }

/** Outcome of a Baserow write: the row id, or a failure carrying no upstream detail. */
export type BaserowResult = { readonly ok: true; readonly data: { readonly id: number } } | BaserowFailure

/** Upper bound on a Baserow write: the form must not hang when the API is slow. */
const BASEROW_TIMEOUT_MS = 5000

const RowResponseSchema = z.object({
  id: z.number().int().positive(),
})

/** One write to a Baserow row: where, with which method, and the fields to send. */
type BaserowWriteInput = {
  url: string
  method: 'POST' | 'PATCH'
  fields: BaserowFields
}

/**
 * Runs one write against a Baserow row endpoint and validates its answer.
 *
 * Server-only by convention: it reads the secret token from `lib/env.ts` and must be imported only
 * from Server Actions or other server code. The base URL comes from the validated `BASEROW_API_URL`
 * (https only, Baserow Cloud by default), so a form value can never redirect the token. A missing
 * token returns `not-configured` without a network call, so a build or a preview without the
 * secrets keeps working. The Baserow error body is never read, returned or logged: it can echo the
 * submitted values.
 */
const requestBaserow = async ({ url, method, fields }: BaserowWriteInput): Promise<BaserowResult> => {
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
 * @param input Table id and fields of the new row.
 * @returns The id of the created row, or a non-personal failure code.
 */
export const createBaserowRow = async ({ tableId, fields }: CreateBaserowRowInput): Promise<BaserowResult> => {
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
