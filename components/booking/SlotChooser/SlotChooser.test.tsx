// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookingSlot } from '@/lib/booking/availability'
import { groupSlotsByDay, type BookingDayGroup } from '@/lib/booking/days'
import type { BookingRules } from '@/lib/booking/rules'
import { SlotChooser, type SlotChooserProps } from './SlotChooser'

/** The schedule these assertions were written for: only the time zone matters here. */
const TEST_RULES: BookingRules = {
  timeZone: 'Europe/Paris',
  weekdays: [1, 2, 3, 4, 5],
  windows: [{ start: '09:30', end: '12:00' }],
  slotMinutes: 30,
  bufferMinutes: 15,
  minimumNoticeHours: 24,
  rescheduleNoticeHours: 12,
  horizonDays: 21,
  maxCallsPerDay: 3,
}

const slotOf = (start: string): BookingSlot => ({
  start,
  end: new Date(Date.parse(start) + TEST_RULES.slotMinutes * 60_000).toISOString(),
})

/** Two days of a November answer: Tuesday 3, with two times, then Thursday 5. */
const DAYS: readonly BookingDayGroup[] = groupSlotsByDay(
  [slotOf('2026-11-03T08:30:00.000Z'), slotOf('2026-11-03T09:00:00.000Z'), slotOf('2026-11-05T08:30:00.000Z')],
  TEST_RULES,
)

/** Every string of the chooser, as the chat passes its own copy. */
const TEXT = {
  dayLabel: 'Jour',
  timeLabel: 'Heure · mardi 3 novembre',
  dayGroupLabel: 'Jours disponibles',
  timeGroupLabel: 'Heures disponibles le mardi 3 novembre',
  timezoneNote: 'Les horaires sont indiqués en heure de Paris.',
} as const

const onPickDay = vi.fn()
const onPickTime = vi.fn()

const renderChooser = (props: Partial<SlotChooserProps> = {}) =>
  render(
    <SlotChooser
      days={props.days ?? DAYS}
      pickedDayKey={props.pickedDayKey === undefined ? '2026-11-03' : props.pickedDayKey}
      pickedSlotStart={props.pickedSlotStart ?? null}
      dayLabel={TEXT.dayLabel}
      timeLabel={TEXT.timeLabel}
      dayGroupLabel={TEXT.dayGroupLabel}
      timeGroupLabel={TEXT.timeGroupLabel}
      timezoneNote={TEXT.timezoneNote}
      focusAnchor={props.focusAnchor}
      onPickDay={onPickDay}
      onPickTime={onPickTime}
    />,
  )

/** Stubs the motion preference the row reads before scrolling a picked day back into view. */
const stubReducedMotion = (reduced: boolean): void => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }))
}

beforeEach(() => {
  onPickDay.mockReset()
  onPickTime.mockReset()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SlotChooser', () => {
  it('names both groups, and every day button by the text it shows', () => {
    renderChooser()

    const dayGroup = screen.getByRole('group', { name: TEXT.dayGroupLabel })
    // The visible card is « mar / 3 / nov »: the accessible name is that same text, with no
    // aria-label overriding it (axe's label-content-name-mismatch rule).
    expect(within(dayGroup).getByRole('button', { name: /mar\s*3\s*nov/ })).toBeTruthy()
    expect(within(dayGroup).getByRole('button', { name: /jeu\s*5\s*nov/ })).toBeTruthy()
    for (const day of within(dayGroup).getAllByRole('button')) {
      expect(day.getAttribute('aria-label')).toBeNull()
    }

    const timeGroup = screen.getByRole('group', { name: TEXT.timeGroupLabel })
    expect(
      within(timeGroup)
        .getAllByRole('button')
        .map((time) => time.textContent),
    ).toEqual(['09:30', '10:00'])
    expect(screen.getByText(TEXT.dayLabel)).toBeTruthy()
    expect(screen.getByText(TEXT.timeLabel)).toBeTruthy()
    expect(screen.getByText(TEXT.timezoneNote)).toBeTruthy()
  })

  it('presses the picked day and the picked time, and leaves the others unpressed', () => {
    renderChooser({ pickedSlotStart: '2026-11-03T09:00:00.000Z' })

    const dayGroup = screen.getByRole('group', { name: TEXT.dayGroupLabel })
    expect(
      within(dayGroup)
        .getByRole('button', { name: /mar\s*3\s*nov/ })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      within(dayGroup)
        .getByRole('button', { name: /jeu\s*5\s*nov/ })
        .getAttribute('aria-pressed'),
    ).toBe('false')

    const timeGroup = screen.getByRole('group', { name: TEXT.timeGroupLabel })
    expect(within(timeGroup).getByRole('button', { name: '09:30' }).getAttribute('aria-pressed')).toBe('false')
    expect(within(timeGroup).getByRole('button', { name: '10:00' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('reports each pick to its caller, and exposes the slot start on the time button', () => {
    renderChooser()

    fireEvent.click(screen.getByRole('button', { name: /jeu\s*5\s*nov/ }))
    expect(onPickDay).toHaveBeenCalledWith('2026-11-05')

    const time = within(screen.getByRole('group', { name: TEXT.timeGroupLabel })).getByRole('button', { name: '10:00' })
    expect(time.getAttribute('data-booking-slot')).toBe('2026-11-03T09:00:00.000Z')
    fireEvent.click(time)
    expect(onPickTime).toHaveBeenCalledWith({ start: '2026-11-03T09:00:00.000Z', end: '2026-11-03T09:30:00.000Z' })

    for (const button of [...screen.getAllByRole('button')]) {
      expect(button.tagName).toBe('BUTTON')
      expect((button as HTMLButtonElement).type).toBe('button')
    }
  })

  it('shows the day row alone until a day is picked', () => {
    renderChooser({ pickedDayKey: null })

    expect(screen.getByRole('group', { name: TEXT.dayGroupLabel })).toBeTruthy()
    expect(screen.queryByRole('group', { name: TEXT.timeGroupLabel })).toBeNull()
    expect(screen.queryByText(TEXT.timeLabel)).toBeNull()
    expect(screen.queryByText(TEXT.timezoneNote)).toBeNull()
  })

  it('shows the day row alone when the picked day left the answer', () => {
    renderChooser({ pickedDayKey: '2026-11-04' })

    expect(screen.getByRole('group', { name: TEXT.dayGroupLabel })).toBeTruthy()
    expect(screen.queryByRole('group', { name: TEXT.timeGroupLabel })).toBeNull()
  })

  it('brings a picked day that sits outside the row back into it', () => {
    const scrollTo = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const isRow = this.getAttribute('role') === 'group' && this.getAttribute('aria-label') === TEXT.dayGroupLabel
      if (isRow) return { left: 0, right: 360, top: 0, bottom: 100, width: 360, height: 100 } as DOMRect
      if (this.getAttribute('aria-pressed') === 'true')
        return { left: 400, right: 468, top: 0, bottom: 76, width: 68, height: 76 } as DOMRect
      return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 } as DOMRect
    })
    stubReducedMotion(false)

    renderChooser()

    expect(scrollTo).toHaveBeenCalledWith({ left: 108, behavior: 'smooth' })
  })

  it('jumps instead of scrolling when motion is reduced', () => {
    const scrollTo = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const isRow = this.getAttribute('role') === 'group' && this.getAttribute('aria-label') === TEXT.dayGroupLabel
      if (isRow) return { left: 0, right: 360, top: 0, bottom: 100, width: 360, height: 100 } as DOMRect
      if (this.getAttribute('aria-pressed') === 'true')
        return { left: -80, right: -12, top: 0, bottom: 76, width: 68, height: 76 } as DOMRect
      return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 } as DOMRect
    })
    stubReducedMotion(true)

    renderChooser()

    expect(scrollTo).toHaveBeenCalledWith({ left: -80, behavior: 'auto' })
  })

  it('anchors the flow on the picked day card only when its caller asks for it', () => {
    const { unmount } = renderChooser({ focusAnchor: true })

    const dayGroup = screen.getByRole('group', { name: TEXT.dayGroupLabel })
    const anchors = [...dayGroup.querySelectorAll('[data-booking-focus]')]
    expect(anchors).toHaveLength(1)
    expect(anchors[0]?.getAttribute('aria-pressed')).toBe('true')
    expect(anchors[0]?.getAttribute('data-booking-focus')).toBe('true')

    unmount()
    renderChooser()
    expect(screen.getByRole('group', { name: TEXT.dayGroupLabel }).querySelector('[data-booking-focus]')).toBeNull()
  })

  it('brings a day card that takes focus fully inside the row, without animating', () => {
    const scrollTo = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo })
    stubReducedMotion(false)
    renderChooser()

    const row = screen.getByRole('group', { name: TEXT.dayGroupLabel })
    const card = screen.getByRole('button', { name: /jeu\s*5\s*nov/ })
    const rowBox = { left: 0, right: 360, top: 0, bottom: 100, width: 360, height: 100 } as DOMRect
    const cardBox = { left: 400, right: 468, top: 0, bottom: 76, width: 68, height: 76 } as DOMRect
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(rowBox)
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(cardBox)

    card.focus()

    expect(scrollTo).toHaveBeenCalledWith({ left: 108, behavior: 'auto' })
    scrollTo.mockClear()

    // A card already inside the strip leaves the row where it is.
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({ ...cardBox, left: 20, right: 88 } as DOMRect)
    card.focus()

    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('leaves the row alone when the picked day is already inside it', () => {
    const scrollTo = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo })

    renderChooser()

    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('leaves every control natively keyboard-operable, the days before the times in the Tab order', () => {
    renderChooser()

    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
    for (const button of buttons) {
      // A native <button type="button"> without `disabled` and without a negative tabindex is
      // focusable and activated by Enter and Space by the platform itself: the chooser introduces
      // no widget that would need its own key handling.
      expect(button.tagName).toBe('BUTTON')
      expect(button.getAttribute('tabindex')).toBeNull()
      expect((button as HTMLButtonElement).disabled).toBe(false)
    }

    // The Tab order follows the DOM: the day row first, then the picked day's times.
    const dayGroup = screen.getByRole('group', { name: TEXT.dayGroupLabel })
    const timeGroup = screen.getByRole('group', { name: TEXT.timeGroupLabel })
    expect(dayGroup.compareDocumentPosition(timeGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(buttons[0]?.parentElement).toBe(dayGroup)
    expect(buttons.at(-1)?.parentElement).toBe(timeGroup)
  })
})
