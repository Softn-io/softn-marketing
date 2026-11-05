# Softn.io — one-page site (FR)

Mel's site for her studio Softn: building websites and web apps, and setting up AI workflows and automations. Targets: SMBs, small dev teams, solo entrepreneurs, non-technical startups. Goal: generate leads (free 30-minute discovery call, action plan in return). Design: Claude Design, project "Softn.io Site v3" and "Softn.io Contact", delivered by handoff (local bundle).

The rules in `.claude/rules/` (typescript, nextjs, context7) load on their own: do not duplicate them here.

## Language

- Config files and agent instructions: English.
- Code, identifiers, code comments, commit messages: English.
- Site copy, chatbot texts, legal pages, SEO metadata, files in `docs/content-proposals/`: **French**.

## Stack

- Next.js (latest stable), App Router, `app/` at the root, no `src/`, no `pages/`
- TypeScript strict · Tailwind v4 (CSS-only config) · custom components (no UI kit) · pnpm
- Design tokens: **`@softnio-labs/tokens`** (public npm, published from Mel's Nx monorepo), single source, with a generated Tailwind mapping; never a local copy. Dark and light modes — **dark is the brand default** (Softn is dark-first), light activates on explicit system preference or explicit user choice; `data-theme` overrides both
- Zod at boundaries · Vitest (unit) · Playwright (E2E and visual) · Lighthouse CI
- Vercel (deployment) · GitHub Actions (CI)
- Analytics: **Umami**, loaded after consent · Booking: **Google Calendar API** (direct, server-side: `freebusy` + `events.insert` with a Google Meet link) · Leads: **Baserow**, server-side only
- FR today, EN possible later: no hardcoded text in components

## Commands

Target scripts, to be created at project init (do not invent other names):
`pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm lint:tailwind` (runs `scripts/check-tailwind-defaults.mjs`) · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e` · `pnpm lighthouse`

## Architecture

- `app/` **only** routes, layout, special files and `api/` (Route Handlers). No route-private folders (`_components/`, `_hooks/`, `_actions/`) under `app/`: route-specific code lives in the shared folders below. No route groups until a second route family exists (legal pages vs home)
- `components/ui/` custom primitives (Button, Card…) · `components/layout/` page chrome (Header, Footer) · `components/sections/` real page sections only (hero, offers, method, FAQ…) · `components/chatbot/`; `components/forms/` added when the first form lands. **One folder per component** (`components/ui/ThemeToggle/`) holding the component, its CSS Module and all its unit tests (`ThemeToggle.test.tsx`, plus tests of the helper scripts it owns). Small primitives stay flat. A composite component (`components/layout/Header/`) keeps its entry (`index.ts`, `Header.tsx`) and its sub-components at the folder root, puts non-component code in `hooks/`, `context/`, `data/` and `styles/`, and its unit tests in `tests/`. Anything reused by a second component is promoted to a shared folder (`lib/`, `hooks/`)
- `lib/` integrations (env, baserow, booking, google, consent, analytics) and pure helpers, site constants, nav config; once helpers pile up, group them in role-named subfolders (e.g. `lib/text/`). No `utils/`, `helpers/` or `config/` folder
- `schemas/` Zod schemas at boundaries (added with the first one) · `hooks/` hooks shared across components (added when needed) · `actions/` shared Server Actions (added with the first one) · `types/` ambient and shared types
- `locales/fr/` typed copy (single source of content)
- `e2e/` Playwright · `docs/` documentation, SEO brief, GDPR. Unit tests are colocated next to the code they cover (in the component's own `tests/` subfolder for composite components); no root `tests/` folder, no `src/`

## Git workflow

- Branches `develop` (integration) and `main` (production). Never modify these two directly.
- Work on `feat/…`, `fix/…`, `chore/…` created from `develop`. PRs target `develop`. A release PR `develop` → `main` only when Mel asks.
- **Conventional Commits** (`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`).
- Pushing branches is allowed. **Mel validates every PR before any merge**: Claude never merges and never force-pushes.

## Definition of done

`pnpm lint`, `pnpm lint:tailwind`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass; Lighthouse ≥ 90 (Performance, Accessibility, Best Practices, SEO); no hardcoded text; no unvalidated dependency; no third party loaded before consent.

## Dependencies

A hook blocks `pnpm add` and equivalents. Every dependency goes through a **"Dependency request"** raised to `/ship`, which submits it to Mel (package + version, justification, alternatives including "no dependency", size, license, advisories, personal data). Anticipated candidates, to be validated: `@softnio-labs/tokens`, `zod`, `vitest`, `@playwright/test`, `jsdom`, `@testing-library/react` (with its peer `@testing-library/dom`), `lucide-react` (icons), `@lhci/cli`, `next-intl` (later).

## Content

- Voice, tone, lexicon: `docs/brand-voice.md` (read it before writing any copy). Summary: **formal "vous" everywhere**, first-person "je" (Mel speaks), warm and expert, pragmatic AI, emojis only in the chatbot and very rare.
- Copy is **proposed** in `docs/content-proposals/` and **validated by Mel** before integration into `locales/fr/`.
- No invented figure, testimonial, client or result. No prices displayed. The word « vitrine » is banned.
- SEO brief: `docs/seo-brief.md` (keywords: automatisation, agents IA; all of France).

## Chatbot

- Answers visitor questions through **Mistral Small 4** (`mistral-small-2603`, pinned), grounded in the validated **OKF v0.2** bundle in `locales/fr/okf/`. Server-side only: `lib/assistant/` (loader, system prompt, Mistral fetch client), `app/api/assistant/route.ts`, `schemas/assistant.ts` (Zod). Shared with the client: `schemas/assistantLimits.ts`, a Zod-free module for the bounds and the response guards (keeps Zod out of the browser bundle and the CSP).
- **Fail closed**: a missing key, a non-conformant bundle or an unavailable model answers the generic `chatbot.error.llm` copy, never an ungrounded answer. The fallback and error wording live in `locales/fr/chatbot.ts`; the model only returns the `[[FALLBACK]]` marker, which the route swaps for that copy.
- No SDK and no new dependency: plain `fetch`, model id pinned in `lib/assistant/mistral.ts`. `MISTRAL_API_KEY` is optional, server-only, never `NEXT_PUBLIC_`.
- Assistant with a **first name** (single constant in `locales/fr/chatbot.ts`).
- The **first message** discloses that it is a virtual assistant (transparency: AI Act art. 50, and good practice).
- Explicit consent **before** any personal data is collected. The composer asks visitors not to enter personal data; questions and the current history go to Mistral AI (processor row in `docs/rgpd/processors.md`), and nothing is kept by Softn.io.
- Booking: the reservation flow of the Agent section (`components/sections/Agent/`, lazy-loaded) collects consent, need, slot, identity, goes through `app/api/booking/` (slots + booking), and books directly in **Google Calendar**; the lead is stored in **Baserow** with `createBaserowRow`. Rules live in `lib/booking/rules.ts`, the slot computation in `lib/booking/availability.ts`, the Google client in `lib/google/`. No service-account key is stored: the server authenticates **keyless**, presenting the deployment's Vercel OIDC token (the `x-vercel-oidc-token` request header, `VERCEL_OIDC_TOKEN` in development) to Google Workload Identity Federation, which signs a short-lived assertion for the service account that impersonates the Workspace owner in `GOOGLE_CALENDAR_OWNER` (`GCP_PROJECT_NUMBER`, `GCP_WORKLOAD_IDENTITY_POOL_ID`, `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`). The events go to the calendar in `GOOGLE_CALENDAR_ID`, a dedicated secondary calendar whose id is its address; free/busy reads that calendar **and** the owner's own calendar, plus Mel's personal calendar when `GOOGLE_PERSONAL_CALENDAR_ID` is set (shared as "See only free/busy", busy times on booking weekdays only, never event detail), so a busy owner is never booked over; French public holidays are never offered. The consent instant is stamped by the server on receipt. Slot re-checked before the event; nothing is stored if the re-check or the calendar fails.

## Security and GDPR

- Cookie banner kept. No third party before consent.
- The Baserow token and every secret stay server-side, and the Google booking connection is keyless. Env vars validated in `lib/env.ts`.
- Every processor (Baserow, Google Calendar, Google Meet, Mistral AI, Upstash, Vercel, Umami) is listed in `docs/rgpd/processors.md`: role, data, hosting, DPA, transfer safeguard outside the EU.
- Legal pages: legal notice (mentions légales), privacy policy, cookie policy.
- No personal data in logs or analytics events.

## Agent team (`.claude/agents/`)

| Agent            | Role                                                                  |
| ---------------- | --------------------------------------------------------------------- |
| `nextjs-dev`     | Next.js / Tailwind implementation, custom components, design fidelity |
| `content-seo`    | Proposes and reviews copy (SEO, tone) — writes only in `docs/`        |
| `chatbot-dev`    | Chatbot, Google Calendar booking, Baserow lead sync, consent          |
| `qa`             | Tests, accessibility, visual fidelity, Lighthouse budgets             |
| `security-audit` | Security and GDPR review — read-only                                  |
| `git-pr`         | Commits, branches, PRs — never merges                                 |

Read @AGENTS.md for latest updates and recommendations to write up-to-date Next.js code and practices.

`/backlog` decomposes the design handoff into standalone GitHub issues on a Kanban Project board (Todo / In Progress / Pending / In Review / Done) — run once to seed the task list, Mel validates the breakdown before anything is created.

`/ship` orchestrates one task: scoping → dev → copy validation → QA → security → PR. Run it with a GitHub issue reference (`/ship #12`) once a backlog exists, or with a free-text task otherwise. It runs in the main conversation because that is where Mel validates. When run against an issue, the resulting PR closes it (`Closes #12`), and the Project board's built-in automation moves the card to Done on merge.

The hooks and permissions in `settings.json` apply to the main session. Check that they also apply to subagents.

## The main conversation never writes application code

Receiving the Claude Design handoff, a description of a feature, or any other request to "build" or "implement" something is **not** an instruction to write files in `app/`, `components/`, `content/`, `lib/`, `tests/` or `e2e/` directly in the main conversation. That code only gets written by `nextjs-dev`, `content-seo`, `chatbot-dev` or `qa`, delegated to by `/ship` — never by the main thread itself, even for something that looks small.

On receiving the design handoff (or any new feature request) outside of `/ship`, the correct response is to run `/backlog` (to turn it into tracked tasks) or `/ship` (for a single task) — not to start implementing. If asked to "just do it quickly" without going through `/ship`, say so and point to the slash command instead of writing the code directly.

## Forbidden

- Writing to `app/`, `components/`, `content/`, `lib/`, `tests/` or `e2e/` from the main conversation instead of delegating through `/ship`
- Reading or writing any `.env*` (except `.env.example`)
- Adding a dependency without validation · using npm, yarn or bun
- `middleware.ts`, `pages/`, `tailwind.config.*`, arbitrary Tailwind values, hardcoded colors
- Redefining or duplicating a `--softn-*` token in the site (it lives in `@softnio-labs/tokens`)
- Tailwind default colors, font sizes, shadows or radii that Softn does not redefine (`bg-white`, `text-lg`, `shadow-xl`, `rounded-2xl`, `bg-gray-*`): the package resets them and such a class generates nothing
- Hardcoded text in a component · publishing unvalidated copy
- Merging, `push --force`, committing directly to `main` or `develop`
- A secret in `NEXT_PUBLIC_*` or in the repo
