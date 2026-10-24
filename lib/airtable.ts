import { z } from 'zod'
import { readEnv, type Env } from '@/lib/env'

/** Value accepted in an Airtable record: the scalar and multi-select shapes the API writes with `typecast: false`. */
export type AirtableFieldValue = string | number | boolean | readonly string[]

/** Fields of the record to create, keyed by Airtable field name. */
export type AirtableFields = Readonly<Record<string, AirtableFieldValue>>

/** Arguments of {@link createAirtableRecord}. */
export type CreateAirtableRecordInput = {
  /** Airtable table id (`tbl…`) or table name, resolved by the caller from the validated env. */
  tableId: string
  fields: AirtableFields
}

/** Non-personal failure codes, mapped to a generic message by the calling Server Action. */
export type AirtableError = 'not-configured' | 'request-failed'

/** Outcome of an Airtable write: the new record id, or a failure code. */
export type AirtableResult = { ok: true; data: { id: string } } | { ok: false; error: AirtableError }

const AIRTABLE_API_URL = 'https://api.airtable.com/v0'

/** Upper bound on an Airtable write: the form must not hang when the API is slow. */
const AIRTABLE_TIMEOUT_MS = 5000

const CreateRecordResponseSchema = z.object({
  id: z.string().min(1),
})

/**
 * Creates one record in an Airtable table.
 *
 * Reusable by the waitlist, the contact form and the chatbot lead sync: the caller passes the table
 * id and the fields, this helper owns the request shape, the timeout and the failure mapping. It is
 * server-only by convention: it reads the secret token from `lib/env.ts` and must be imported only
 * from Server Actions or other server code.
 *
 * A missing token, base id or table id returns `not-configured` without a network call, so a build
 * or a preview without the secrets keeps working. The Airtable error body is never read, returned
 * or logged: it can echo the submitted values.
 */
export const createAirtableRecord = async ({ tableId, fields }: CreateAirtableRecordInput): Promise<AirtableResult> => {
  let environment: Env
  try {
    environment = readEnv()
  } catch {
    return { ok: false, error: 'not-configured' }
  }

  const { AIRTABLE_TOKEN: token, AIRTABLE_BASE_ID: baseId } = environment
  if (token === undefined || baseId === undefined || tableId === '') {
    return { ok: false, error: 'not-configured' }
  }

  try {
    const response = await fetch(`${AIRTABLE_API_URL}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields, typecast: false }),
      cache: 'no-store',
      signal: AbortSignal.timeout(AIRTABLE_TIMEOUT_MS),
    })

    if (!response.ok) return { ok: false, error: 'request-failed' }

    const payload: unknown = await response.json()
    const parsed = CreateRecordResponseSchema.safeParse(payload)
    if (!parsed.success) return { ok: false, error: 'request-failed' }

    return { ok: true, data: { id: parsed.data.id } }
  } catch {
    return { ok: false, error: 'request-failed' }
  }
}
