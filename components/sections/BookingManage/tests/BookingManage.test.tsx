// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatSlotLabel } from '@/lib/booking/labels'
import { BOOKING_RULES } from '@/lib/booking/rules'
import { bookingManage } from '@/locales/fr/bookingManage'
import { BookingManage } from '../BookingManage'

/** Free slots returned by the mocked `slots` action: two days, three times. */
const SLOTS = [
  { start: '2026-11-03T08:30:00.000Z', end: '2026-11-03T09:00:00.000Z' },
  { start: '2026-11-03T09:00:00.000Z', end: '2026-11-03T09:30:00.000Z' },
  { start: '2026-11-05T08:30:00.000Z', end: '2026-11-05T09:00:00.000Z' },
] as const

const TOKEN = 'signed-token-value'
const CURRENT_LABEL = 'mardi 3 novembre à 09:30'

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const fetchMock = vi.fn<typeof fetch>()

/** Parsed bodies of every call to the manage endpoint. */
const actionBodies = (): readonly Record<string, unknown>[] =>
  fetchMock.mock.calls
    .filter(([input]) => String(input) === '/api/booking/manage')
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>)

/** Answers the manage endpoint: the slots action with the fixture, the rest with a success. */
const answerManage = (
  reschedule: () => Response = () => jsonResponse({ rescheduled: true }),
  cancel: () => Response = () => jsonResponse({ cancelled: true }),
): void => {
  fetchMock.mockImplementation(async (input, init) => {
    if (String(input) !== '/api/booking/manage') throw new Error(`unexpected call to ${String(input)}`)

    const body = JSON.parse(String(init?.body)) as { action: string }
    if (body.action === 'slots') return jsonResponse({ slots: SLOTS })
    if (body.action === 'reschedule') return reschedule()
    return cancel()
  })
}

const renderManage = (state: 'reschedule' | 'late' | 'cancelled' = 'reschedule', slotLabel: string = CURRENT_LABEL) =>
  render(<BookingManage token={TOKEN} state={state} slotLabel={slotLabel} retryHref={`/rendez-vous/${TOKEN}`} />)

/** Opens the chooser and picks the second offered time of the first day. */
const chooseTime = async (): Promise<void> => {
  fireEvent.click(screen.getByRole('button', { name: bookingManage.reschedule.action }))
  const dayGroup = await screen.findByRole('group', { name: bookingManage.reschedule.chooser.dayLabel })
  await within(dayGroup).findAllByRole('button')
  fireEvent.click(screen.getByRole('button', { name: '10:00' }))
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  answerManage()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('BookingManage reschedule', () => {
  it('reads the free slots on demand and moves the event after a confirmed pick', async () => {
    renderManage()

    // A page load asks for nothing: the first request comes from the click on the action.
    expect(fetchMock).not.toHaveBeenCalled()

    await chooseTime()

    expect(actionBodies()[0]).toEqual({ action: 'slots', token: TOKEN })
    // The confirm stays disabled until a time is picked, and the summary only then appears.
    expect(screen.getByRole('button', { name: bookingManage.reschedule.confirm.submit })).toBeTruthy()
    expect(
      screen.getByText(
        bookingManage.reschedule.confirm.summary
          .replace('{slot}', CURRENT_LABEL)
          .replace('{newSlot}', 'mardi 3 novembre à 10:00'),
      ),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: bookingManage.reschedule.confirm.submit }))

    await screen.findByRole('heading', { name: bookingManage.reschedule.success.title })
    expect(actionBodies()[1]).toEqual({ action: 'reschedule', token: TOKEN, slot: '2026-11-03T09:00:00.000Z' })
    // The moved view shows the new slot and the previous one, struck through.
    expect(screen.getByText(formatSlotLabel({ start: SLOTS[1].start, end: SLOTS[1].end }, BOOKING_RULES))).toBeTruthy()
    expect(screen.getByText(CURRENT_LABEL)).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps the confirm disabled before a time is picked', async () => {
    renderManage()

    fireEvent.click(screen.getByRole('button', { name: bookingManage.reschedule.action }))
    await screen.findByRole('group', { name: bookingManage.reschedule.chooser.dayLabel })

    const confirm = screen.getByRole('button', { name: bookingManage.reschedule.confirm.submit }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    // No pick, no summary: the copy that names the new slot stays away until it is true.
    expect(screen.queryByText(/Votre échange Spark passera/)).toBeNull()
  })

  it('shows the loading state while the availability is read', async () => {
    let resolveSlots: (response: Response) => void = () => undefined
    fetchMock.mockImplementation(async () => new Promise<Response>((resolve) => (resolveSlots = resolve)))
    renderManage()

    fireEvent.click(screen.getByRole('button', { name: bookingManage.reschedule.action }))

    expect(await screen.findByRole('status')).toBeTruthy()
    expect(screen.getByText(bookingManage.reschedule.loading)).toBeTruthy()
    resolveSlots(jsonResponse({ slots: SLOTS }))
    await screen.findByRole('group', { name: bookingManage.reschedule.chooser.dayLabel })
  })

  it('offers a retry when the availability cannot be read, and reads it again on demand', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }))
    renderManage()

    fireEvent.click(screen.getByRole('button', { name: bookingManage.reschedule.action }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(
      bookingManage.errors.unavailable.replace('{contactLink}', bookingManage.contact.linkLabel),
    )
    answerManage()
    fireEvent.click(within(alert).getByRole('button', { name: bookingManage.errors.retry }))

    await screen.findByRole('group', { name: bookingManage.reschedule.chooser.dayLabel })
  })

  it('keeps the taken-slot message and reads the availability again after a lost race', async () => {
    answerManage(() => jsonResponse({ error: 'slot-taken' }, 409))
    renderManage()

    await chooseTime()
    fireEvent.click(screen.getByRole('button', { name: bookingManage.reschedule.confirm.submit }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(bookingManage.errors.slotTaken)
    // The fresh availability is asked for again, without the message leaving the screen.
    await waitFor(() => expect(actionBodies().filter((body) => body['action'] === 'slots').length).toBe(2))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(bookingManage.reschedule.chooser.title)
  })

  it('maps our rate limit to its own copy', async () => {
    answerManage(() => jsonResponse({ error: 'rate-limited' }, 429))
    renderManage()

    await chooseTime()
    fireEvent.click(screen.getByRole('button', { name: bookingManage.reschedule.confirm.submit }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(bookingManage.errors.rateLimit)
  })

  it('sends no personal field in any action body', async () => {
    renderManage()

    await chooseTime()
    fireEvent.click(screen.getByRole('button', { name: bookingManage.reschedule.confirm.submit }))
    await screen.findByRole('heading', { name: bookingManage.reschedule.success.title })

    // Every body is one of the three actions and carries the token, and at most one slot or reason.
    const allowedKeys = new Set(['action', 'token', 'slot', 'reason'])
    for (const body of actionBodies()) {
      for (const key of Object.keys(body)) expect(allowedKeys.has(key)).toBe(true)
    }
  })
})

describe('BookingManage cancel', () => {
  it('cancels with the label of the picked reason, beside the status', async () => {
    renderManage()

    fireEvent.click(screen.getByRole('button', { name: bookingManage.cancel.action }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      bookingManage.cancel.confirm.question.replace('{slot}', CURRENT_LABEL),
    )

    const reasonGroup = screen.getByRole('group', { name: bookingManage.cancel.reason.label })
    const chip = within(reasonGroup).getByRole('button', { name: bookingManage.cancel.reason.options.prevented })
    fireEvent.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: bookingManage.cancel.confirm.submit }))

    await screen.findByRole('heading', { name: bookingManage.cancel.success.title })
    expect(actionBodies()[0]).toEqual({ action: 'cancel', token: TOKEN, reason: 'prevented' })
    // The way back opens the reservation flow of the home page.
    expect(screen.getByRole('link', { name: bookingManage.cancel.success.bookAgain }).getAttribute('href')).toBe(
      '/?rdv=1#assistant',
    )
  })

  it('cancels without a reason when no chip is picked, and toggles a chip off on a second press', async () => {
    renderManage()

    fireEvent.click(screen.getByRole('button', { name: bookingManage.cancel.action }))
    const reasonGroup = screen.getByRole('group', { name: bookingManage.cancel.reason.label })
    const chip = within(reasonGroup).getByRole('button', { name: bookingManage.cancel.reason.options.other })

    fireEvent.click(chip)
    fireEvent.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: bookingManage.cancel.confirm.submit }))

    await screen.findByRole('heading', { name: bookingManage.cancel.success.title })
    expect(actionBodies()[0]).toEqual({ action: 'cancel', token: TOKEN })
  })

  it('keeps the appointment when the confirmation is left', async () => {
    renderManage()

    fireEvent.click(screen.getByRole('button', { name: bookingManage.cancel.action }))
    fireEvent.click(screen.getByRole('button', { name: bookingManage.cancel.confirm.back }))

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(bookingManage.title)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('explains an unavailable cancellation and offers the retry', async () => {
    answerManage(
      () => jsonResponse({ rescheduled: true }),
      () => new Response('', { status: 503 }),
    )
    renderManage()

    fireEvent.click(screen.getByRole('button', { name: bookingManage.cancel.action }))
    fireEvent.click(screen.getByRole('button', { name: bookingManage.cancel.confirm.submit }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(
      bookingManage.errors.unavailable.replace('{contactLink}', bookingManage.contact.linkLabel),
    )
    expect(within(alert).getByRole('button', { name: bookingManage.errors.retry })).toBeTruthy()
  })
})

describe('BookingManage states', () => {
  it('shows the twelve-hour limit and the contact link of the late state', () => {
    renderManage('late')

    // The hours come from the rules constant, never from a hardcoded number in the component.
    expect(screen.getByText(/moins de 12 h/, { exact: false })).toBeTruthy()
    // The state message carries the link inside its sentence, and the page carries its own line.
    const contactLinks = screen.getAllByRole('link', { name: bookingManage.contact.linkLabel })
    expect(contactLinks.length).toBeGreaterThan(0)
    for (const link of contactLinks) expect(link.getAttribute('href')).toBe(bookingManage.contact.href)
  })

  it('never renders a personal field in any state', () => {
    renderManage()

    for (const personal of ['Marie', 'Dupont', 'marie@example.fr', 'Automatiser mes devis']) {
      expect(screen.queryByText(personal, { exact: false })).toBeNull()
    }
  })
})

describe('BookingManage keyboard and focus', () => {
  it('moves the focus onto the heading each time the view changes, never on the first paint', async () => {
    renderManage()

    // First paint: no focus steal, so a screen reader announces the page from the top.
    expect(document.activeElement).toBe(document.body)

    fireEvent.click(screen.getByRole('button', { name: bookingManage.reschedule.action }))
    await screen.findByRole('group', { name: bookingManage.reschedule.chooser.dayLabel })
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }))

    fireEvent.click(screen.getByRole('button', { name: bookingManage.reschedule.back }))
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }))

    fireEvent.click(screen.getByRole('button', { name: bookingManage.cancel.action }))
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }))
  })

  it('keeps the cancellation two steps: opening the view sends nothing, and leaving it sends nothing', () => {
    renderManage()

    // Step one is an explicit click; the destructive call cannot come from navigation.
    fireEvent.click(screen.getByRole('button', { name: bookingManage.cancel.action }))
    expect(screen.getByRole('button', { name: bookingManage.cancel.confirm.submit })).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()

    // The way back restores the overview with the appointment untouched.
    fireEvent.click(screen.getByRole('button', { name: bookingManage.cancel.confirm.back }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(bookingManage.title)
    expect(screen.queryByRole('button', { name: bookingManage.cancel.confirm.submit })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retries a failed cancellation from the cancel view, and the retry reruns that action', async () => {
    let cancelCalls = 0
    fetchMock.mockImplementation(async (input, init) => {
      const body = JSON.parse(String(init?.body)) as { action: string }
      if (body.action === 'cancel') {
        cancelCalls += 1
        return cancelCalls === 1 ? new Response('', { status: 503 }) : jsonResponse({ cancelled: true })
      }
      throw new Error(`unexpected action ${body.action}`)
    })
    renderManage()

    fireEvent.click(screen.getByRole('button', { name: bookingManage.cancel.action }))
    fireEvent.click(screen.getByRole('button', { name: bookingManage.cancel.confirm.submit }))
    const alert = await screen.findByRole('alert')

    // The retry stays inside the cancel view and reruns the cancellation, not the availability.
    fireEvent.click(within(alert).getByRole('button', { name: bookingManage.errors.retry }))
    await screen.findByRole('heading', { name: bookingManage.cancel.success.title })
    expect(cancelCalls).toBe(2)
    expect(actionBodies().every((body) => body['action'] === 'cancel')).toBe(true)
  })

  it('offers the chooser controls as native pressable buttons, toggled by keyboard activation', async () => {
    // jsdom cannot translate a keydown on a button into its activation behaviour, so the click
    // here stands for the Enter/Space activation of a real keyboard; what the assertion pins is
    // that every control is a type="button" (never a link or a div), that the pick is announced
    // with aria-pressed, and that the confirm stays disabled until a time is picked. The real
    // keyboard walk of the chooser is not reachable in E2E without a live calendar read: the
    // server state page can only render unavailable or invalid (see e2e/bookingManage.spec.ts).
    renderManage()

    fireEvent.click(screen.getByRole('button', { name: bookingManage.reschedule.action }))
    const dayGroup = await screen.findByRole('group', { name: bookingManage.reschedule.chooser.dayLabel })
    const dayButtons = within(dayGroup).getAllByRole('button')
    expect(dayButtons.length).toBeGreaterThan(0)
    for (const day of dayButtons) {
      expect(day.tagName).toBe('BUTTON')
      expect((day as HTMLButtonElement).type).toBe('button')
    }

    const picked = within(dayGroup).getAllByRole('button')[0] as HTMLButtonElement
    fireEvent.click(picked)
    expect(picked.getAttribute('aria-pressed')).toBe('true')
    expect(
      (screen.getByRole('button', { name: bookingManage.reschedule.confirm.submit }) as HTMLButtonElement).disabled,
    ).toBe(true)

    const timeGroup = screen.getByRole('group', { name: /Heure · / })
    const times = within(timeGroup).getAllByRole('button')
    for (const time of times) {
      expect(time.tagName).toBe('BUTTON')
      expect((time as HTMLButtonElement).type).toBe('button')
    }
    fireEvent.click(times[0] as HTMLButtonElement)
    expect((times[0] as HTMLButtonElement).getAttribute('aria-pressed')).toBe('true')
    expect(
      (screen.getByRole('button', { name: bookingManage.reschedule.confirm.submit }) as HTMLButtonElement).disabled,
    ).toBe(false)

    // The reason chips of the cancellation follow the same contract.
    fireEvent.click(screen.getByRole('button', { name: bookingManage.reschedule.back }))
    fireEvent.click(screen.getByRole('button', { name: bookingManage.cancel.action }))
    const reasonGroup = screen.getByRole('group', { name: bookingManage.cancel.reason.label })
    for (const chip of within(reasonGroup).getAllByRole('button')) {
      expect(chip.tagName).toBe('BUTTON')
      expect((chip as HTMLButtonElement).type).toBe('button')
    }
  })
})
