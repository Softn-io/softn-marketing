---
name: backlog
description: Decomposes the softn.io site build into standalone GitHub issues on a Kanban project board, so Mel can track progress task by task. Run once at the start of development, from the validated design handoff, or again to add a new batch of tasks.
argument-hint: "(optional) a scope to limit the decomposition, e.g. \"just the chatbot section\""
disable-model-invocation: true
---

# /backlog — turn the design handoff into a tracked task list

You run in the **main conversation**: creating 15–25 GitHub issues in bulk is expensive to redo, so Mel validates the breakdown before anything is created. Talk to Mel in French.

## Step 1 — Read the scope

- `CLAUDE.md`, `docs/design/README.md`, `docs/brand-voice.md`, `docs/rgpd/processors.md`.
- The exported Claude Design bundle at `docs/design/project/` (HTML, styles, screenshots, design chat export) — read what's there to know what sections/features actually exist to decompose. If the folder is missing or empty, say so and stop: don't guess a task list from `docs/design/README.md`'s generic rules alone.
- If `$ARGUMENTS` narrows the scope (e.g. "just the chatbot section"), only decompose that part; otherwise cover the whole one-page site.

## Step 2 — Draft the task list (create nothing yet)

- One task = one thing `/ship` can deliver as a single PR: a page section, the chatbot flow, a legal page, a CI workflow, an SEO pass — never "build the whole site", never "add one button."
- For each task, work out: title, one-line scope, owning agent (`nextjs-dev` / `content-seo` / `chatbot-dev` / `qa` / `security` / `git-pr`), and its dependencies on other tasks (referenced by title — issue numbers don't exist yet).
- Order the list so a sensible build sequence is visible: foundation first (layout shell, tokens wiring, theming), then content sections, then the chatbot/booking flow, then SEO/CI/legal pages last.
- Present the full list to Mel as a compact table (title · scope · agent · depends on). **Do not create any GitHub issue or Project until she approves it.** If she asks for changes, revise and re-present rather than partially creating issues.

## Step 3 — Create the board (only once approved)

- If no GitHub Project exists yet for this repo, create one with `gh project create` — columns **Todo / In Progress / Pending / In Review / Done**. Tell Mel to turn on the two built-in automations in the Project's workflow settings (Project → ⋯ → Workflows): "Item added to project → Todo" and "Pull request merged → Done". These are native GitHub features — don't try to script status transitions by hand with `gh project item-edit`, it's brittle and the built-in automation already does it.
- Create issues **in dependency order** (so a "Depends on #N" line can reference a real number) with `gh issue create`:
  - Title: short, imperative, matches the task.
  - Body: scope, acceptance criteria drawn from `CLAUDE.md`'s Definition of Done and the relevant part of `docs/design/README.md`, and a `Depends on #N` line if applicable.
  - Label for the owning agent: `content`, `frontend`, `chatbot`, `qa`, `security`, or `devops`. Create these labels first with `gh label create` if they don't exist yet.
- Add each issue to the Project with `gh project item-add`.

## Step 4 — Report

- Give Mel the Project board URL and the created issue list (number + title). Tell her the next step: `/ship #<number>` to work a specific task — it reads the issue for its scope and links the PR back to it automatically.

## Rules

- Never create an issue for something Mel hasn't approved in the draft table first.
- A task must be independently shippable: if two tasks must land together, merge them into one issue instead of pretending they're standalone.
- A label must match an existing agent in `.claude/agents/`; if a task doesn't cleanly fit one agent, say so instead of forcing a label.
- If `gh` is unavailable or a `gh project`/`gh issue` call fails (e.g. the Projects feature isn't enabled on the repo), say so plainly and fall back to printing the validated task table as markdown instead of silently doing nothing.
