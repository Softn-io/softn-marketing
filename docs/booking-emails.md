# Booking emails sent by Softn.io

> Companion to issue #116 (option C). Google notifies no guest anymore — the booking insert, the
> reschedule patch and the cancel carry `sendUpdates=none` — so Softn.io sends the service emails
> itself, through the Gmail API, as the Workspace alias `meet@softn.io` with the display name
> `Softn.io`. Copy lives in `locales/fr/bookingEmails.ts`, the sending code in `lib/booking/emails.ts`,
> the calendar client in `lib/google/gmail.ts`.

## What is sent, and when

| Moment                        | Email                        | Calendar file                                          |
| ----------------------------- | ---------------------------- | ------------------------------------------------------ |
| Booking confirmed             | Confirmation                 | `invitation.ics`, `METHOD:REQUEST`, `SEQUENCE:0`        |
| Reschedule confirmed          | Update                       | `METHOD:REQUEST`, next `SEQUENCE`, same `UID`           |
| Cancellation confirmed        | Cancellation                 | `METHOD:CANCEL`, `STATUS:CANCELLED`, next `SEQUENCE`     |
| About 24 h before the call    | Reminder (scheduled job)     | none                                                    |

The calendar file's `UID` is the Google event's `iCalUID`, identical in every file of one booking, so
a guest's calendar updates the entry it already holds instead of adding a second one. `SEQUENCE` is 0
at booking and grows by one at each change: the counter kept in the event's private properties
(`softnEmailSequence`) is the source of that number, and the Google event's own `sequence` is used
when it is exactly the expected value. `ORGANIZER` is `meet@softn.io`, `ATTENDEE` the guest, and
`DTSTART`/`DTEND` are anchored on `Europe/Paris` with a `VTIMEZONE` block.

## What the emails do not do

- **A guest's Accept or Decline is an email, not an event update.** Answering an invitation from the
  attached calendar file, or from the Gmail interface, lands in the `meet@softn.io` inbox as a
  normal message. The Google event is not updated by that answer; Mel reads it and decides.
- **Changes made by hand in Google Calendar are not covered.** If Mel edits or moves an event
  directly in Calendar, Google asks her whether the guest should be notified, and Softn sends
  nothing: only the booking, the reschedule and the cancellation of the site send an email, each
  with its calendar file.

## Failures

Nothing is retried automatically. A message that could not be sent marks its event with
`extendedProperties.private.softnEmailFailed` = `confirmation`, `update`, `cancellation` or
`reminder`, and logs one non-personal code; when even the mark cannot be stored, a second code is
logged. The booking, the reschedule or the cancel stands whatever happens, and the visitor's answer
never changes. The reminder is the exception: its failure leaves no flag, so the next scheduled run
sends it again.

## The reminder job

`app/api/booking/reminders/route.ts` runs one reminder pass, and
`.github/workflows/reminders.yml` calls it. The workflow runs from the default branch (`main`) only,
so it is merged and live before the first reminder goes out.

- **Schedule**: `17,47 * * * *` (UTC), off the hour, twice an hour, plus `workflow_dispatch` for a
  manual run from the Actions tab. The job catches up by design: each run reminds about **every**
  booked call starting within the next 24 hours that has not been reminded about yet, so a delayed or
  dropped run costs nothing.
- **Delays and drops**: GitHub queues scheduled runs (they can start late, and the top of the hour is
  the busiest), and it disables `schedule` triggers after 60 days without repository activity on a
  public repository. GitHub then mails the owner; re-enable the workflow from the Actions tab
  ("Enable workflow"), or push to the repository. `workflow_dispatch` still works while it is
  disabled.
- **Concurrency**: one run at a time (`concurrency` without `cancel-in-progress`), so a delayed run
  is queued behind the running one rather than cancelling it.
- **Protection**: `CRON_SECRET`, a string of at least 32 characters, is the bearer token of the
  route. The same value must be set in **two** places: the Vercel project environment (**Production
  only** — a Preview or Development deployment must not inherit it) and the GitHub repository secret
  of the same name (Settings → Secrets and variables → Actions). Without it on the server the route
  answers `503`; with a missing or wrong token it answers `401`; the comparison is made in constant
  time and only `POST` is accepted. A rotated value must be changed in both places.
- **Preview deployments never remind**: the route answers `503` before any authentication when
  `VERCEL_ENV` is `preview`, because a preview's manage links would point at an address that
  disappears with the deployment, and a run there could race production into a duplicate send.
  Production, `development` and a local run (no marker) work normally.
- **What one pass does**, per call of the window:
  - it skips a call already reminded about for its current slot — the flag
    `extendedProperties.private.softnReminderSentFor` names the slot start the last reminder was sent
    for, so a **reschedule re-arms** the reminder by itself (the new start no longer matches the
    flag, and the reschedule path has nothing to clear);
  - it waits a **two-hour grace** after the confirmation or the update of the same slot, read from
    `extendedProperties.private.softnEmailSentAt`, which the mail path writes when the message
    really left. That instant is preferred over the event's `updated`, which every internal mark and
    every hand edit moves without any email being sent;
  - it sends the reminder **first**, then writes the flag. A failed send leaves no flag (the next run
    retries), marks the event `softnEmailFailed=reminder` and logs one non-personal code; a failed
    flag write after a sent reminder logs its own code, and a duplicate is then possible at the next
    run. One call's failure never stops the others.
- **Answer**: non-personal counts only, `{ sent, failed, skipped }`, with `200`. When the window
  itself cannot be read — the calendar list call or its credential chain — the run answers `503`
  with `{ error: 'unavailable' }` and logs one non-personal code, so the scheduled GitHub run fails
  visibly instead of reporting a green zero; the failure code names the credential step (`sts`,
  `delegation-token`) when one failed, so a live `400` is not misread as a calendar bug. Per-call
  failures keep the `200` and the counts.

## Bookings made before the guest name was stored

The later emails of a booking are sent from a request that knows nothing but the event, so the
guest's first and last name parts travel in the event's private properties (`softnGuestFirstName`,
`softnGuestLastName`), written by the booking insert. Mel's decision: an event created **before**
this deployment has no such mark, and there is **no fallback** — its reminder, its update and its
cancellation are refused with `compose guest-missing`, mark the event `softnEmailFailed` and log one
non-personal code. This is self-healing: it stops as soon as the slot has passed, and every booking
made after the deployment is emailed normally.

## Known Google errors

Every failed Google call now logs Google's machine-readable reason when the answer carries one — the
`reason` of the first entry of `error.errors`, or `error.status` when the answer has none — as in
`calendar unavailable: events patch unauthorized status=403 reason=forbiddenForNonOrganizer`. The
reason is the only part of an error body that is ever read: the human-readable `message` is never
read, logged or returned (`lib/google/errorReason.ts`). The token is kept only when it is a short word
of letters, so an underscored `error.status` such as `PERMISSION_DENIED` is dropped rather than logged.
The private-property marks answer a rate limit with a bounded retry, documented below.

### What the documentation states

Sources, read through Context7 (library ids `/websites/developers_google_workspace_calendar_api`,
`/websites/developers_google_workspace_calendar_api_v3_reference`,
`/websites/developers_google_workspace_gmail_api`):

- `https://developers.google.com/workspace/calendar/api/guides/errors` — the documented 403 reasons:
  `forbiddenForNonOrganizer` (an update is trying to set a **shared** event property on a copy that is
  not the organizer's; the same page suggests `events.patch` when no shared property is meant to
  change), `quotaExceeded` ("Calendar usage limits exceeded"), `rateLimitExceeded` ("can return either
  403 or 429"), `userRateLimitExceeded`.
- `https://developers.google.com/workspace/calendar/api/guides/quota` — the Calendar API has, beside
  the per-project and per-user quotas, **operational limits** that "might be limited at any time. For
  example, if you attempt to write to a single calendar in quick succession".
- `https://developers.google.com/workspace/calendar/api/v3/reference/events/patch` — `events.patch`
  consumes three quota units; `sendUpdates` is documented as a guest-notification selector only
  (`all`, `externalOnly`, `none`), with no documented default for an omitted value and no documented
  failure attached to any of its values.
- `https://developers.google.com/workspace/calendar/api/guides/extended-properties` — `private`
  extended properties are specific to the `calendarId`/`eventId` of the request and are the preferred
  write of a patch; `https://developers.google.com/workspace/calendar/api/concepts/inviting-attendees-to-events`
  — they are never shared with an attendee's copy.
- `https://developers.google.com/workspace/gmail/api/guides/handle-errors` — the Gmail 403 reasons are
  `rateLimitExceeded`, `userRateLimitExceeded` and the mail-sending limits (answered 429).

### Retry of the private-property marks

The marks written back to an event (`softnLeadRowId`, `softnLeadStored`, `softnEmailFailed`,
`softnEmailSentAt`, `softnReminderSentFor`, all through `events.patch`) are internal best-effort
writes: a lost one costs a bookkeeping fact, never the booking. Those calls, and only those, retry a
rate-limited answer with exponential backoff, as Google documents it:

- `https://developers.google.com/workspace/calendar/api/guides/errors` — `rateLimitExceeded` "can
  return either 403 or 429 error codes — currently they are functionally similar and should be
  responded to in the same way, by using exponential backoff".
- `https://developers.google.com/workspace/calendar/api/guides/quota` — for time-based quota errors
  the docs recommend a **truncated exponential backoff**, with a `random_number_milliseconds` jitter
  "to avoid cases in which many clients are synchronized … and all retry at once".

The rule implemented in `lib/google/markRetry.ts`: a **429**, or a **403 whose machine-readable reason
is `rateLimitExceeded` or `userRateLimitExceeded`**, is retried **at most twice**, waiting about
**500 ms** then about **1500 ms**, each jittered by at most ±20 %, so the extra wait of one call stays
under 2.5 s. A success ends the walk at once. Any other answer — another reason such as
`forbiddenForNonOrganizer` or `quotaExceeded`, a 401, a 500, a timeout, an unreadable body — is
returned on the first attempt exactly as before, reason included, and the caller logs it as it always
did. `quotaExceeded` is deliberately not retried: it reports a calendar usage limit that a short wait
does not clear, and Google's own backoff guidance is for time-based limits.

Nothing else of the booking is retried: the insert, the reschedule patch, the deletion and the Gmail
send have side effects a second attempt could duplicate (a second event, a second email) or undo, and
the visitor waits on them, so their failures are answered as they are.

### What the documentation does not state

- No page read above says that `sendUpdates=none` on `events.patch`, or on any event write, can
  produce a 403 — for a service account or for any other caller. The patch behaviour is therefore left
  as it is, and only the diagnostics changed.
- `forbiddenForServiceAccounts` and `insufficientPermissions` are not listed among the Calendar error
  reasons read above; they are generic Google API reasons, kept here as hypotheses only.
- Nothing read above links a **Gmail (consumer) attendee** to a 403 on the organizer's own copy of the
  event.

### Hypotheses on the 403 of the row-id patch (not documented)

1. `rateLimitExceeded` or `quotaExceeded` — operational limits. One booking writes the same calendar in
   quick succession: `freeBusy`, the events list, the insert, then the row-id patch seconds later, and
   `events.patch` alone is documented as consuming three quota units. Both reasons are documented 403s
   and both are transient, which fits a failure that left the Baserow row created but the event
   unmarked — and fits Mel's retest (2026-11-05), which saw no 403 and a Baserow row created, then
   updated after a reschedule and a cancellation: an intermittent failure, not a permanent refusal.
2. `forbiddenForNonOrganizer` — documented only for **shared** properties on a copy that is not the
   organizer's. The row-id patch sends `extendedProperties.private` alone, which the docs call private
   to the organizer's copy, so the documented case does not match exactly; it stays plausible only if
   Google answers it for a broader class of writes on this calendar.
3. `insufficientPermissions` — a scope or Workspace-admin delegation problem would normally fail the
   insert too, and the insert succeeded on the same request with the same token, so this is unlikely.
4. Something else entirely, which the reason token will name — including a patch that Google refuses
   while accepting the insert for a reason no page read above documents.

### Consequence chain Mel observed

A failed row-id patch leaves `softnLeadRowId` absent from the event. A later reschedule or cancellation
reads the event, finds no row id, and logs `lead not updated: baserow not-configured`, so Baserow keeps
its stale row while the calendar moves (`app/api/booking/manage/route.ts`). That is why a Gmail guest's
reschedule **and** cancellation left Baserow untouched, while a non-Google guest whose patch succeeded
had the id stored and its later updates reached Baserow: the root cause is the 403 at booking time, not
the manage calls.

### What the next live test should look for

- The booking log line of the failed patch, now ending in `reason=<token>`; that token names the cause.
  A mark that a retry saved logs nothing at all: the retry is silent, and only a failure that outlived
  both retries reaches the log, still with the last answer's reason.
- On a later reschedule or cancellation of the same booking, whether the log says
  `lead not updated: baserow not-configured` (id missing, patch failed at booking) or carries a Baserow
  status (id present, Baserow itself refused).

## Open points for Mel

- Gmail's data location is not confirmed. `docs/rgpd/processors.md` records the Google Gmail row as
  "to verify" with the Workspace data-region documentation
  (`support.google.com/a/answer/9223653`) as the source to check.
- The `gmail.send` delegated scope must be added in the Workspace Admin console beside the two
  calendar scopes, and `meet@softn.io` set up as a "Send mail as" alias of the impersonated owner.
