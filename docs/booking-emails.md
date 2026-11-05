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

## Open points for Mel

- Gmail's data location is not confirmed. `docs/rgpd/processors.md` records the Google Gmail row as
  "to verify" with the Workspace data-region documentation
  (`support.google.com/a/answer/9223653`) as the source to check.
- The `gmail.send` delegated scope must be added in the Workspace Admin console beside the two
  calendar scopes, and `meet@softn.io` set up as a "Send mail as" alias of the impersonated owner.
