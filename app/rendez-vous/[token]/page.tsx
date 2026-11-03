import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { MinimalHeader } from '@components/layout/MinimalHeader'
import { BookingManage, BookingManageFooter, type BookingManageState } from '@components/sections/BookingManage'
import { formatSlotLabel } from '@/lib/booking/labels'
import { BOOKING_MANAGE_PATH, readBookingLinkSecret, verifyBookingManageToken } from '@/lib/booking/manageToken'
import { BOOKING_RULES, manageRescheduleVerdict } from '@/lib/booking/rules'
import { readSubjectTokenFromHeaderStore } from '@/lib/google/auth'
import { readBookingEvent, type BookingEvent } from '@/lib/google/calendar'
import { bookingManage } from '@/locales/fr/bookingManage'

/**
 * The page renders per request: it reads a signed token, the calendar and the clock, so nothing of
 * one visitor may be cached for the next.
 */
export const dynamic = 'force-dynamic'

/**
 * Metadata of the manage page: hidden from search engines and without a canonical URL. The route is
 * deliberately absent from `robots.txt`, so a crawler can read this `noindex`; it is absent from the
 * sitemap too.
 */
export const metadata: Metadata = {
  title: bookingManage.meta.title,
  robots: { index: false, follow: false },
  alternates: { canonical: null },
}

/** Props of the page: the signed token is the last segment of the URL. */
type RendezvousPageProps = {
  params: Promise<{ token: string }>
}

/** Arguments of {@link BookingManageScreen}. */
type BookingManageScreenProps = {
  /** Signed token of the link, sent with every action. */
  token: string
  /** State the page renders in. */
  state: BookingManageState
  /** Label of the appointment, absent when the calendar does not hold a readable start. */
  slotLabel?: string | undefined
}

/** Label of the appointment as the calendar holds it, or `undefined` when it cannot be read. */
const slotLabelOf = (event: BookingEvent): string | undefined => {
  if (event.start === undefined) return undefined

  const end = event.end ?? new Date(Date.parse(event.start) + BOOKING_RULES.slotMinutes * 60_000).toISOString()
  const label = formatSlotLabel({ start: event.start, end }, BOOKING_RULES)
  return label === '' ? undefined : label
}

/** Page chrome and the client island, in the state the server decided. */
const BookingManageScreen = ({ token, state, slotLabel }: BookingManageScreenProps) => (
  <>
    <MinimalHeader />
    <BookingManage
      token={token}
      state={state}
      retryHref={`${BOOKING_MANAGE_PATH}/${encodeURIComponent(token)}`}
      {...(slotLabel === undefined ? {} : { slotLabel })}
    />
    <BookingManageFooter />
  </>
)

/**
 * Management page of a booked call, reached from the signed link of the invitation.
 *
 * A `GET` changes nothing: the page reads the token, verifies it, reads the event and renders one
 * state. An invalid token, an expired one and an event that is not a booking all render without any
 * further Google call; an event the calendar cannot answer renders the unavailable state with a
 * retry. The timing rules are judged on the event's real start, so an old link never gets around
 * the reschedule notice after a move.
 *
 * @param props Route props: the token segment of the URL.
 * @returns The page in the state the token, the calendar and the clock decide.
 */
const RendezvousPage = async ({ params }: RendezvousPageProps) => {
  const { token } = await params
  const now = new Date()
  const verified = verifyBookingManageToken({ secret: readBookingLinkSecret(), token, now })

  if (!verified.ok) {
    // An expired link and a forged one are told apart: the first says the call has started or the
    // link has expired, the second only says the link is not valid.
    return <BookingManageScreen token={token} state={verified.error === 'expired' ? 'started' : 'invalid'} />
  }

  const subjectToken = readSubjectTokenFromHeaderStore(await headers())
  const event = await readBookingEvent({ eventId: verified.data.eventId, subjectToken })

  if (!event.ok) {
    return <BookingManageScreen token={token} state={event.error === 'not-found' ? 'invalid' : 'unavailable'} />
  }

  if (event.data.cancelled) {
    return <BookingManageScreen token={token} state="cancelled" slotLabel={slotLabelOf(event.data)} />
  }

  if (event.data.start === undefined) {
    return <BookingManageScreen token={token} state="unavailable" />
  }

  const verdict = manageRescheduleVerdict({ eventStart: event.data.start, now, rules: BOOKING_RULES })
  if (verdict === 'started') {
    return <BookingManageScreen token={token} state="started" slotLabel={slotLabelOf(event.data)} />
  }
  if (verdict === 'too-late') {
    return <BookingManageScreen token={token} state="late" slotLabel={slotLabelOf(event.data)} />
  }

  return <BookingManageScreen token={token} state="reschedule" slotLabel={slotLabelOf(event.data)} />
}

export default RendezvousPage
