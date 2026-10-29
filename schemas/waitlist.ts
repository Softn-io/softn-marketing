/*
 * Server-only Zod schema of the waitlist Server Action. It exports the schema and its inferred type
 * and nothing else: the constants and plain types shared with the client live in `waitlistLimits`,
 * and client code imports that module directly. Importing this one instead would ship Zod to the
 * browser, whose JIT probe calls `Function("")` and trips the production CSP.
 */
import { z } from 'zod'
import { WAITLIST_EMAIL_MAX_LENGTH } from './waitlistLimits'

/**
 * Waitlist form input, validated on the server before any Baserow write.
 *
 * The e-mail is trimmed and lowercased first, so `  Mel@Example.FR ` and `mel@example.fr` store the
 * same address. The honeypot and render timestamp are optional so a no-JavaScript submission,
 * which cannot fill the timestamp, stays valid.
 */
export const WaitlistSubmissionSchema = z.object({
  email: z.string().trim().toLowerCase().max(WAITLIST_EMAIL_MAX_LENGTH).pipe(z.email()),
  honeypot: z.string().max(200).default(''),
  renderedAt: z.string().max(20).default(''),
})

export type WaitlistSubmission = z.infer<typeof WaitlistSubmissionSchema>
