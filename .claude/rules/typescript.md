# TypeScript — Softn.io (standalone site)

> Loaded without `paths:` (same reason as `rules/nextjs.md`): in an empty repo, a path-scoped rule only
> loads when Claude reads a matching file, so it wouldn't apply when the first `.ts`/`.tsx` files are
> created. Loaded unconditionally at launch instead, same priority as `CLAUDE.md`.
> Complements `~/.claude/rules/typescript.md` (global). Softn.io specifics only.

---

## Compiler flags — non-negotiable

`tsconfig.json` must enable:

- `strict: true`
- `noUncheckedIndexedAccess: true`
- `noImplicitReturns: true`
- `noFallthroughCasesInSwitch: true`
- `forceConsistentCasingInFileNames: true`
- `exactOptionalPropertyTypes: true`
- `noImplicitOverride: true`
- `moduleResolution: "bundler"` — never `"node"`, `"node16"`, or `"nodenext"`

**Forbidden:** `skipLibCheck: true`, `allowJs: true`, `checkJs: true`, any application `.js` file.

When bootstrapping with `create-next-app`, **fix the generated defaults**: Next.js generates `allowJs: true` and `skipLibCheck: true`, both forbidden here.
If a third-party dependency prevents `tsc` from passing with these flags, **escalate**: never re-enable `skipLibCheck` without Mel's validation.

Generated `.mjs` config files (`postcss.config.mjs`, `eslint.config.mjs`) are tolerated; `next.config.ts` stays TypeScript.

## Result type pattern

Recoverable failures return a Result, never throw:

```ts
export type Result<T, E = string> = { ok: true; data: T } | { ok: false; error: E }
```

## Exports

- **Named exports only** in `lib/`, `components/` and `locales/`. No `export default`.
- **Required exception**: Next.js special files need a default export (`page.tsx`, `layout.tsx`, `error.tsx`, `loading.tsx`, `not-found.tsx`, `template.tsx`, `default.tsx`, `opengraph-image.tsx`, `sitemap.ts`, `robots.ts`, `next.config.ts`). Route Handlers export `GET`, `POST`… by name.
- Re-export through an `index.ts` barrel only when a folder exposes several items to other modules.
- Type re-export uses `export type { Foo }` — never implicit.

## Forbidden patterns

- `any` — use `unknown` then narrow. A genuine third-party escape hatch needs a one-line `// reason: …` comment.
- `@ts-ignore` — use `@ts-expect-error <reason>` instead.
- `as Foo` casts on data crossing a boundary (HTTP, webhook, env, file I/O) — validate with Zod and infer the type.
- `enum` keyword — use an `as const` object literal + string literal union.
- Non-null assertion `!` as a habit. One per file = code smell.
- Mutable module-level state (unless an explicit singleton, commented as such).

## Comments — logic only, never decisions or tickets

A comment helps a reader understand **logic, behavior, non-obvious invariants**. Never a changelog.

**Forbidden in code comments:**

- Ticket/issue refs (`fixes #123`, `see JIRA-456`)
- Decision/rationale narration (`// decided to use X because…`, `// changed from Y to X`)
- Author/date/PR breadcrumbs (`// added by…`, `// as of PR #…`, `// TODO(name):`)

That content belongs in the PR description or an ADR (`docs/decisions/`) — never in source.

**Required instead:**

- JSDoc on every exported function, hook, component and Route Handler — inputs, outputs, expected behavior
- Inline `//` comments only for the non-obvious **why-of-the-logic** (a hidden constraint, a workaround for a specific edge case, a subtle invariant)

```ts
/** Retries up to 3x: the Airtable API returns 429 under bursts of requests. */
async function fetchWithRetry() {
  /* … */
}
```

Not:

```ts
// decided to bump retries to 3 after review feedback
async function fetchWithRetry() {
  /* … */
}
```

## Zod at boundaries

Every Route Handler, Server Action and webhook declares an input schema and, when useful, an output schema. Derive TS types via `z.infer<typeof Schema>` — never write the parallel shape by hand.

```ts
export const CreateLeadInput = z.object({
  /* … */
})
export type CreateLeadInput = z.infer<typeof CreateLeadInput>
```

Environment variables are validated **once** in `lib/env.ts` (server-side Zod schema); the rest of the code imports `env`, never `process.env` directly.
