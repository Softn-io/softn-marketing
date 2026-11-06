# 0002 — Hand-rolled triggers for the lazily loaded drawer and offer sheet

- **Status:** Accepted
- **Date:** 2026-11-06
- **Issue:** #55 (reduce initial JS and LCP on `/preview`)
- **PR:** #131

## Context

`.claude/rules/nextjs.md` requires complex interactive widgets to use an accessible headless
primitive library ("never hand-roll focus trapping, ARIA or keyboard handling"). The mobile
navigation drawer and the offer detail sheet follow that rule: both popups are Base UI
(`Drawer` / `Dialog`) and Base UI owns the modal behaviour — focus trap, initial focus on the
close control, Escape, swipe-down dismissal, swipe-ignore areas, scroll lock and focus return.

Issue #55 moved those popups out of the initial bundle: `MobileMenuDrawer` and `OfferSheet` are
loaded with `next/dynamic`, mounted closed on the first intent (hover, focus, press) and kept
mounted afterwards, so the first open does not pay for the chunk load. That leaves the *triggers*
(the header burger and the offer cards) in the initial bundle.

Base UI 1.9.0 supports detached triggers for exactly this split: a module-scope
`Drawer.createHandle()` / `Dialog.createHandle()` shared by a `Trigger` rendered outside the
lazily loaded `Root`. Measured on the production build of `/preview` (same-session comparison,
mobile Lighthouse preset, 5 runs each):

| | Before (committed, #55 state) | Detached triggers |
| --- | --- | --- |
| Initial JS (chunks referenced by the SSR HTML) | 10 chunks, 644 661 B raw / 203 875 B gzip | 12 chunks, 743 883 B raw / 238 988 B gzip |
| Lighthouse Performance, median (min / max) | 91 (91 / 91) | 89 (89 / 92) |
| LCP, median | 3455.7 ms | 3758.1 ms (+302 ms) |
| TBT, median | 57 ms | 57 ms |
| Total byte weight | 418 066 B | 455 308 B |

The +35 113 B gzip comes from two new initial chunks: `17afly5r31i2r.js` (67 092 B raw /
23 006 B gzip) carries the Base UI popup store and trigger wiring (`activeTriggerId`,
`triggerElements`, `preventUnmountingOnClose`, the trigger's ARIA attributes), and
`1mpuyf5ofybwz.js` (41 493 B / 16 289 B) plus part of `0xr9h6p26g27r.js` carry the
floating-ui-react context machinery (`floatingRootContext`, `popupRef`, `useClick`). Removing the
hand-rolled trigger buttons freed only ~4 kB gzip. The popup components themselves stay lazy: no
initial chunk contains `FloatingFocusManager`, `useScrollLock`, `data-swipe-dismissed` or the
drawer popup logic.

Two hard limits make that cost unavoidable with Base UI 1.9.0:

- `@base-ui/react` exposes only per-component entry points (`./drawer`, `./dialog`), not per-part
  paths, so the trigger cannot import a smaller module than the one that carries the store and the
  floating-ui context. (`Dialog.Trigger` itself imports the floating-ui-react barrel internally.)
- A detached trigger cannot open an unmounted root: while no root using the handle is mounted, the
  click and any `handle.open()` call are ignored, never replayed (documented behaviour, confirmed
  in `@base-ui/react/utils/popups/popupHandle.mjs`). With the lazy root, a click that lands before
  the chunk arrives would need an external replay mechanism on top of the trigger.

Performance 89 is below the project's Lighthouse ≥ 90 budget, and the extra initial JS is what
costs it.

## Decision

Keep the triggers hand-rolled, as a documented exception to the headless-primitive rule, and keep
the popups on Base UI:

- The burger (`components/layout/Header/MobileMenu.tsx`) stays a plain server-rendered `<button>`
  that owns the open state and sets `aria-haspopup="dialog"` and `aria-expanded={open}` itself.
- The offer cards (`components/sections/Offers/OfferCard.tsx`) keep the invisible overlay button
  (`aria-haspopup="dialog"`, labelled by the card title) and the "close then act" wiring in
  `Offers.tsx`.
- `finalFocus` on `Drawer.Popup` / `Dialog.Popup` is a function: for a close that is not a keyboard
  close (`closeType !== '' && closeType !== 'keyboard'`) it focuses the trigger with
  `{ preventScroll: true, focusVisible: false }` before Base UI returns focus, so a pointer close
  leaves no focus ring while a keyboard close keeps the `:focus-visible` ring Base UI sets.

Base UI still owns everything it owned before: the popups, the focus trap, initial focus, Escape,
swipe-down dismissal, scroll lock, focus return and the `:focus-visible` marking of keyboard
closes. The exception is limited to the trigger elements' ARIA and open/close wiring.

## Consequences and guard rails

- The behaviour this exception relies on is pinned by tests: the `e2e/header.spec.ts` focus-ring
  matrix (Chromium Pixel 7 and WebKit iPhone 13, first and later opens, pointer and keyboard
  closes), `e2e/offerSheet.spec.ts`, and `e2e/lazyMount.spec.ts` (SSR burger announces
  `aria-haspopup`/`aria-expanded`; a programmatic click before the chunk arrives still opens the
  drawer and the sheet; no Base UI chunk is requested at initial load).
- `focusVisible` in `focus()` options is ignored by browsers older than Chrome/Edge 86, Safari 15.4
  and Firefox 104; those fall back to the browser's focus heuristic, which is the pre-#55
  behaviour (a ring can stay on the trigger after a pointer close of a keyboard-opened layer). No
  current mobile browser is affected.
- This record is the only place for the rationale: code comments stay limited to the non-obvious
  why-of-the-logic (the `closeType` guard, the missing `focusVisible` DOM lib type).
- Revisit this decision when Base UI ships a lighter trigger entry point (a per-part subpath or a
  trigger without the floating-ui context), when the drawer/sheet stop being lazy, or when the
  initial-JS budget stops being the constraint that drove it.
