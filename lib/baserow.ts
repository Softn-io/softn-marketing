import { z } from 'zod'
import { readEnv, type Env } from '@/lib/env'

/** Value accepted in a Baserow row: the scalar and multi-value shapes the REST API writes. */
export type BaserowFieldValue = string | number | boolean | readonly string[]

/** Fields of the row to create, keyed by Baserow field name. */
export type BaserowFields = Readonly<Record<string, BaserowFieldValue>>

/** Arguments of {@link createBaserowRow}. */
export type CreateBaserowRowInput = {
  /** Baserow table id, resolved by the caller from the validated env. */
  tableId: string
  fields: BaserowFields
}

/** Non-personal failure codes, mapped to a generic message by the calling Server Action. */
export type BaserowError = 'not-configured' | 'request-failed'

/** Outcome of a Baserow write: the new row id, or a failure code. */
export type BaserowResult = { ok: true; data: { id: number } } | { ok: false; error: BaserowError }

/** Upper bound on a Baserow write: the form must not hang when the API is slow. */
const BASEROW_TIMEOUT_MS = 5000

const CreateRowResponseSchema = z.object({
  id: z.number().int().positive(),
})

/**
 * Creates one row in a Baserow table.
 *
 * Reusable by the waitlist and later forms: the caller passes the table id and the fields, this
 * helper owns the request shape, the timeout and the failure mapping. It is server-only by
 * convention: it reads the secret token from `lib/env.ts` and must be imported only from Server
 * Actions or other server code.
 *
 * The base URL comes from the validated `BASEROW_API_URL` (https only, Baserow Cloud by default),
 * so a form value can never redirect the token. A missing token or table id returns
 * `not-configured` without a network call, so a build or a preview without the secrets keeps
 * working. The Baserow error body is never read, returned or logged: it can echo the submitted
 * values.
 */
export const createBaserowRow = async ({ tableId, fields }: CreateBaserowRowInput): Promise<BaserowResult> => {
  let environment: Env
  try {
    environment = readEnv()
  } catch {
    return { ok: false, error: 'not-configured' }
  }

  const { BASEROW_API_URL: apiUrl, BASEROW_TOKEN: token } = environment
  if (token === undefined || tableId === '') {
    return { ok: false, error: 'not-configured' }
  }

  try {
    const response = await fetch(
      `${apiUrl}/api/database/rows/table/${encodeURIComponent(tableId)}/?user_field_names=true`,
      {
        method: 'POST',
        headers: {
          // Baserow database tokens use the `Token` scheme, not `Bearer`: they are DRF tokens and
          // the API answers `Bearer` with "Authentication credentials were not provided.".
          Authorization: `Token ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fields),
        cache: 'no-store',
        signal: AbortSignal.timeout(BASEROW_TIMEOUT_MS),
      },
    )

    if (!response.ok) return { ok: false, error: 'request-failed' }

    const payload: unknown = await response.json()
    const parsed = CreateRowResponseSchema.safeParse(payload)
    if (!parsed.success) return { ok: false, error: 'request-failed' }

    return { ok: true, data: { id: parsed.data.id } }
  } catch {
    return { ok: false, error: 'request-failed' }
  }
}
