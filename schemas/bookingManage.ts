/*
 * Server-only Zod schemas of the booking management API. Client code imports `bookingManageLimits`
 * instead: importing this module would ship Zod to the browser, whose JIT probe calls `Function("")`
 * and trips the production CSP.
 */
import { z } from 'zod'
import { BOOKING_CANCEL_REASONS, BOOKING_MANAGE_TOKEN_MAX_LENGTH } from './bookingManageLimits'

export * from './bookingManageLimits'

/** Token carried by every manage request, bounded before it reaches the verifier. */
const manageToken = z.string().min(1).max(BOOKING_MANAGE_TOKEN_MAX_LENGTH)

/**
 * Body of a `POST /api/booking/manage` request, discriminated on the action.
 *
 * Every action carries the signed token of the event it acts on; only `reschedule` carries a slot,
 * and only `cancel` carries the optional reason. A reason outside the four known codes is refused
 * here, so no free text ever reaches Baserow, and `slots` carries nothing else to read.
 */
export const BookingManageRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('slots'),
    token: manageToken,
  }),
  z.object({
    action: z.literal('reschedule'),
    token: manageToken,
    slot: z.iso.datetime(),
  }),
  z.object({
    action: z.literal('cancel'),
    token: manageToken,
    reason: z.enum(BOOKING_CANCEL_REASONS).optional(),
  }),
])

export type BookingManageRequest = z.infer<typeof BookingManageRequestSchema>
