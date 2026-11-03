/*
 * Constants, plain types and response guards of the booking management API, with no runtime
 * dependency.
 *
 * This module is imported by the manage page's client island, so it must stay free of Zod: Zod v4
 * probes its JIT support with `Function("")` at load time, which the production CSP (`script-src`
 * without `eval`) blocks. The Zod schemas live in `schemas/bookingManage.ts`, on the server only,
 * and reuse these constants so both sides share one source of truth.
 */

import type { BookingSlot } from '@/lib/booking/availability'

/** Bound on a manage token before it is decoded: well above the longest token the server builds. */
export const BOOKING_MANAGE_TOKEN_MAX_LENGTH = 200

/** Actions a `POST /api/booking/manage` request may carry. */
export const BOOKING_MANAGE_ACTIONS = ['slots', 'reschedule', 'cancel'] as const

/** One action of the manage route. */
export type BookingManageAction = (typeof BOOKING_MANAGE_ACTIONS)[number]

/**
 * Stable codes of the optional cancellation reason.
 *
 * The code travels between the browser and the route; the label the visitor reads and the one
 * written to the leads table come from `locales/fr/bookingManage.ts`. Free text is never accepted.
 */
export const BOOKING_CANCEL_REASONS = ['prevented', 'no-longer-needed', 'found-alternative', 'other'] as const

/** One cancellation reason of the cancel view. */
export type BookingCancelReason = (typeof BOOKING_CANCEL_REASONS)[number]

/** Error codes of the manage route, mapped to locale copy by the client island. */
export const BOOKING_MANAGE_ERROR_CODES = [
  'invalid',
  'rate-limited',
  'unavailable',
  'slot-taken',
  'late',
  'started',
  'cancelled',
] as const

/** One error code of the manage route. Each names a state the copy already covers. */
export type BookingManageErrorCode = (typeof BOOKING_MANAGE_ERROR_CODES)[number]

/** Body of a `slots` answer: free slot times only, never a busy interval or a personal field. */
export type BookingManageSlotsResponse = {
  /** Free slots, oldest first, bounded by the server. */
  slots: readonly BookingSlot[]
}

/** Body of a `reschedule` success answer. */
export type BookingManageRescheduleResponse = {
  /** Always true: the event was moved or the route answered an error code. */
  rescheduled: true
}

/** Body of a `cancel` success answer. */
export type BookingManageCancelResponse = {
  /** Always true: the event was cancelled or the route answered an error code. */
  cancelled: true
}

/** Generic error returned to the UI: it carries no answer and no upstream detail. */
export type BookingManageErrorResponse = {
  /** Error code, mapped to locale copy. */
  error: BookingManageErrorCode
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Checks that a parsed JSON body is the `{ rescheduled: true }` success answer.
 *
 * @param value Parsed JSON body, or anything else.
 * @returns True when the value confirms the move.
 */
export const isBookingManageRescheduleResponse = (value: unknown): value is BookingManageRescheduleResponse =>
  isRecord(value) && value.rescheduled === true

/**
 * Checks that a parsed JSON body is the `{ cancelled: true }` success answer.
 *
 * @param value Parsed JSON body, or anything else.
 * @returns True when the value confirms the cancellation.
 */
export const isBookingManageCancelResponse = (value: unknown): value is BookingManageCancelResponse =>
  isRecord(value) && value.cancelled === true

/**
 * Checks that a parsed JSON body is one of the generic `{ error }` shapes.
 *
 * @param value Parsed JSON body, or anything else.
 * @returns True when the value carries a known error code.
 */
export const isBookingManageErrorResponse = (value: unknown): value is BookingManageErrorResponse =>
  isRecord(value) &&
  typeof value.error === 'string' &&
  (BOOKING_MANAGE_ERROR_CODES as readonly string[]).includes(value.error)
