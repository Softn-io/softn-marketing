/*
 * Shortest-scroll reveal of the assistant section.
 *
 * Two clients scroll the page inside the section: the reservation flow, which follows its newest
 * message and the control of the current step, and the conversation, which brings the composer back
 * when the flow closes. Both must move the page the same way — by what the revealed box is missing,
 * never further — so the geometry lives here once.
 */

/** Token of the gap kept under the sticky header when a box is revealed beneath it. */
const SCROLL_GAP_TOKEN = '--softn-space-24'

/** Token of the gap kept above the bottom edge, so a revealed control never touches it. */
const SCROLL_FOOT_GAP_TOKEN = '--softn-space-8'

/** Reads a length token, in pixels, from the document root. */
const readLengthToken = (name: string): number => {
  const root = document.documentElement
  const value = getComputedStyle(root).getPropertyValue(name).trim()
  if (value === '') return 0

  const amount = Number.parseFloat(value)
  if (!Number.isFinite(amount)) return 0
  if (value.endsWith('rem')) return amount * Number.parseFloat(getComputedStyle(root).fontSize)
  if (value.endsWith('px')) return amount
  return 0
}

/** A box in viewport coordinates: what a reveal shows, and where it sits on screen. */
export type ViewportBox = { readonly top: number; readonly bottom: number }

/**
 * Box grown by the foot gap token.
 *
 * A reveal stops at the box's bottom edge, so a caller that wants a gap under its own content
 * includes it in the box here.
 *
 * @param box Box to grow, in viewport coordinates.
 * @returns The box, its bottom moved down by the gap token.
 */
export const withFootGap = (box: ViewportBox): ViewportBox => ({
  top: box.top,
  bottom: box.bottom + readLengthToken(SCROLL_FOOT_GAP_TOKEN),
})

/**
 * Box of an element in the viewport.
 *
 * @param element Element to measure, or `null` when the caller has none.
 * @returns The box, or `null` when the element is missing or shows nothing.
 */
export const boxOf = (element: Element | null | undefined): ViewportBox | null => {
  if (element === null || element === undefined) return null

  const box = element.getBoundingClientRect()
  if (box.height === 0) return null
  return { top: box.top, bottom: box.bottom }
}

/**
 * Top of the room a revealed box has to fit in: the sticky header's own measured height plus the gap
 * token, read from the stylesheet so no hand-written pixel value is involved.
 */
const stickyOffset = (): number => {
  const header = document.querySelector('header')
  const headerHeight = header === null ? 0 : header.getBoundingClientRect().height
  return headerHeight + readLengthToken(SCROLL_GAP_TOKEN)
}

/**
 * True when a box fits in the room left under the sticky header.
 *
 * @param box Box to check, in viewport coordinates.
 * @returns True when the box is not taller than that room.
 */
export const fitsInRoom = (box: ViewportBox): boolean => box.bottom - box.top <= window.innerHeight - stickyOffset()

/**
 * Shortest scroll that shows one box, in the room left under the sticky header.
 *
 * The box is shown whole whenever the room allows it: the delta moves the page down by the height
 * missing under the fold, up by the height missing under the header, and stays at zero when the box
 * is already there. A box taller than the room cannot be shown whole, so it leads with its own top
 * and its first line stays readable.
 *
 * @param box Box to reveal, in viewport coordinates.
 * @param offset Top of the room, under the sticky header.
 * @param room Height of that room.
 */
const revealDelta = (box: ViewportBox, offset: number, room: number): number => {
  if (box.bottom - box.top > room) return box.top - offset
  if (box.bottom > window.innerHeight) return box.bottom - window.innerHeight
  return Math.min(box.top - offset, 0)
}

/**
 * Brings one box into view with the shortest scroll that shows it.
 *
 * Nothing is scrolled when the box is already in the room under the header, and the page never moves
 * past the box: the content below it — the end of the section, and the section after it — stays under
 * the fold. The jump is instant when the visitor asked for less motion.
 *
 * @param box Box to reveal, in viewport coordinates.
 * @param reducedMotion True when the visitor asked for less motion.
 */
export const revealBox = (box: ViewportBox, reducedMotion: boolean): void => {
  const offset = stickyOffset()
  const delta = revealDelta(box, offset, window.innerHeight - offset)
  if (delta === 0) return

  window.scrollTo({
    // A whole-pixel target: a fractional scroll position can leave the box a fraction of a pixel
    // past the edge it was aligned on, where a pixel-exact check would still read it as outside.
    top: Math.max(0, Math.ceil(window.scrollY + delta)),
    behavior: reducedMotion ? 'instant' : 'smooth',
  })
}
