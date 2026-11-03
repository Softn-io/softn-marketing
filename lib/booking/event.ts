/*
 * Calendar wording of a booking: the event title, the event description and the manage link.
 *
 * The title and the description are built from `locales/fr/chatbot.ts`, and the manage line from
 * `locales/fr/bookingManage.ts`, so no sentence of the invitation is written here. The description
 * carries the visitor's answers, which is what keeps a lead readable in the calendar even if the
 * Baserow row never lands, followed by the signed link that lets the visitor reschedule or cancel.
 *
 * The link is rebuilt per event id: the token is a digest of the id, so a rescheduled event gets a
 * fresh one, and the reminder of a later send recomputes the same URL from the same id and start.
 */

import { interpolate } from '@/lib/interpolate'
import { readEnv } from '@/lib/env'
import { SITE_URL } from '@/lib/site'
import { bookingManage } from '@/locales/fr/bookingManage'
import { chatbot } from '@/locales/fr/chatbot'
import { BOOKING_MANAGE_PATH, bookingManageToken, bookingManageUrl, readBookingLinkSecret } from './manageToken'

/** One lead as the booking flow collected it, with the consent that allowed the collection. */
export type BookingLead = {
  /** Need the visitor described, in their own words. */
  need: string
  /** Visitor's first name. */
  firstName: string
  /** Visitor's last name. */
  lastName: string
  /** Address the invitation is sent to. */
  email: string
  /** Optional phone number. */
  phone?: string
  /** Optional structure the visitor represents. */
  structure?: string
  /** Optional role of the visitor. */
  role?: string
  /** Instant the visitor accepted the consent, written to the calendar event and the Baserow row. */
  consentAt: string
}

/** Arguments of {@link bookingEventDescription}. */
export type BookingEventDescriptionInput = {
  /** Answers the description is built from. */
  lead: BookingLead
  /**
   * Absolute URL of the manage page for this event, or absent when the deployment builds no link:
   * the description then reads like before, without any management line.
   */
  manageUrl?: string
}

/** One labelled line of the description, or nothing when an optional answer was left out. */
const answerLine = (label: string, value: string | undefined): readonly string[] =>
  value === undefined || value.trim() === ''
    ? []
    : [interpolate(chatbot.booking.event.line, { label, value: value.trim() })]

/**
 * Event title of a booking, from the locale.
 *
 * @param lead Answers of the visitor.
 * @returns The title Mel reads in her calendar.
 */
export const bookingEventTitle = (lead: BookingLead): string =>
  interpolate(chatbot.booking.event.title, { firstName: lead.firstName, lastName: lead.lastName })

/**
 * Event description of a booking: the visitor's answers, one labelled line each, then the manage
 * link when the deployment can build one.
 *
 * The answer lines follow the order of the reservation, and are labelled with the field names of the
 * flow, so the description reads like the recap the visitor saw. An optional answer left out
 * produces no line at all, rather than an empty label. The consent is not repeated here: it is
 * written to the event's private properties and to the Baserow row.
 *
 * @param input Answers of the visitor, and the manage URL when there is one.
 * @returns The description, one line per entry.
 */
export const bookingEventDescription = ({ lead, manageUrl }: BookingEventDescriptionInput): string => {
  const lines = [
    ...answerLine(chatbot.booking.steps.need.field, lead.need),
    ...answerLine(chatbot.booking.steps.structure.field, lead.structure),
    ...answerLine(chatbot.booking.steps.role.field, lead.role),
    ...answerLine(chatbot.booking.steps.phone.field, lead.phone),
    ...answerLine(chatbot.booking.steps.email.field, lead.email),
  ]

  if (manageUrl !== undefined) {
    lines.push(interpolate(bookingManage.calendarEvent.line, { link: manageUrl }))
  }

  return lines.join('\n')
}

/** Arguments of {@link bookingManageUrlOfEvent}. */
export type BookingManageUrlOfEventInput = {
  /** Origin of the request that builds the link, so a preview deployment links to itself. */
  origin: string
  /** Event the link manages. */
  eventId: string
  /** Instant the link stops being accepted, normally the event start. */
  expiresAt: string
}

/**
 * Manage URL of one booking event: the signed link the invitation carries.
 *
 * Exported on its own so a later message about an event (a reminder, a confirmation) rebuilds the
 * same link from the same id and instant. Without a signing secret the deployment builds no link at
 * all, and the caller logs the fact once: a booking still succeeds, it just carries no way to manage
 * itself.
 *
 * @param input Origin, event id and expiry instant.
 * @returns The absolute URL, or `null` when the deployment cannot sign one.
 */
export const bookingManageUrlOfEvent = ({
  origin,
  eventId,
  expiresAt,
}: BookingManageUrlOfEventInput): string | null => {
  const secret = readBookingLinkSecret()
  if (secret === undefined) return null

  const token = bookingManageToken({ secret, eventId, expiresAt })
  return token === null ? null : bookingManageUrl({ origin, token })
}

/** Marker every manage URL contains, whatever the deployment's origin is. */
const MANAGE_URL_MARKER = `${BOOKING_MANAGE_PATH}/`

/**
 * Origin the manage link of a booking is built on.
 *
 * In production the link is pinned to the canonical site address, from {@link SITE_URL}: the
 * same-origin guard compares `Origin` to the origin derived from the request URL, so a request
 * whose forged `Host` and `Origin` headers agree would otherwise put a foreign address inside the
 * invitation e-mailed to the visitor. Everywhere else — a preview deployment, development — the
 * origin of the validated request is kept, so a preview signs links that point at the deployment
 * holding its signing secret.
 *
 * @param request Request that passed the route guards.
 * @returns The origin, without trailing slash.
 */
export const bookingManageLinkOrigin = (request: Request): string => {
  let vercelEnv: string | undefined
  try {
    vercelEnv = readEnv().VERCEL_ENV
  } catch {
    vercelEnv = undefined
  }

  return vercelEnv === 'production' ? SITE_URL : new URL(request.url).origin
}

/** Arguments of {@link bookingEventDescriptionWithFreshLink}. */
export type BookingEventDescriptionWithFreshLinkInput = {
  /** Description of the event as the calendar holds it. */
  description: string
  /** Fresh manage URL of the same event. */
  manageUrl: string
}

/**
 * Replaces the manage URL inside an existing description, keeping every answer line around it.
 *
 * A patch replaces the whole description, so a reschedule rebuilds it from the one the calendar
 * holds and swaps only the link. The link is located by the manage path, not by the shape of the
 * line, so a copy edit or a token from another origin still matches. The last occurrence is the
 * link line: an answer that itself mentions the path stays untouched, because the line is written
 * after every answer. An event that carries no link yet — one booked before the link existed —
 * gains the line instead of losing its answers.
 *
 * @param input Description as stored, and the fresh URL.
 * @returns The description with the fresh link.
 */
export const bookingEventDescriptionWithFreshLink = ({
  description,
  manageUrl,
}: BookingEventDescriptionWithFreshLinkInput): string => {
  const markerIndex = description.lastIndexOf(MANAGE_URL_MARKER)
  if (markerIndex === -1) {
    const line = interpolate(bookingManage.calendarEvent.line, { link: manageUrl })
    return description === '' ? line : `${description}\n${line}`
  }

  // The URL runs from the whitespace before the manage path to the whitespace after it; only the
  // path marks it, so nothing else in the description has to match a copy that may change.
  let from = markerIndex
  while (from > 0 && !/\s/.test(description.charAt(from - 1))) from -= 1

  let to = markerIndex + MANAGE_URL_MARKER.length
  while (to < description.length && !/\s/.test(description.charAt(to))) to += 1

  return `${description.slice(0, from)}${manageUrl}${description.slice(to)}`
}
