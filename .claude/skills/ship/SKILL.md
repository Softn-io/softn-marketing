---
name: ship
description: Orchestrates the full workflow of a softn.io site task: scoping, development, copy validation, QA, security, commits and PR. Run with /ship followed by the task, or by a GitHub issue reference (e.g. "/ship #12").
argument-hint: "<task to carry out, or a GitHub issue reference, e.g. \"#12\" or \"implement the Offer section from the handoff\">"
disable-model-invocation: true
---

# /ship — orchestration

You orchestrate the task: $ARGUMENTS

You run in the **main conversation**: this is where Mel validates, since a nested subagent cannot ask her questions. You delegate the work to the agents in `.claude/agents/` and handle each **validation gate**. Use **caveman mode Ultra** when communicating with the agents.

## Step 1 — Scoping

- If `$ARGUMENTS` is a GitHub issue reference (`#12`, `12`, or an issue URL), run `gh issue view <number> --json title,body,labels` and use it as the task's scope instead of asking Mel to restate it. Keep the issue number for later steps.
- Read `CLAUDE.md` and the task context (handoff bundle, `docs/brand-voice.md`, `docs/seo-brief.md` if useful).
- Create the branch from `develop`: `feat/…`, `fix/…` or `chore/…` — when an issue number is known, prefix it (`feat/12-offer-section`).
- Present Mel with a short plan (files involved, agents used, risks). **Validate before continuing** if the task is more than a small fix.

## Step 2 — Content (if any copy is involved)

- Delegate to `content-seo`: proposal in `docs/content-proposals/`.
- **Validation gate**: show the copy to Mel. Nothing is integrated without her approval.

## Step 3 — Development

- Delegate to `nextjs-dev` (site) and/or `chatbot-dev` (chatbot, booking, Airtable). **One writing agent at a time**: no parallel edits on the same files. Use **caveman mode Ultra** when communicating with the agents.
- A **Dependency request** or **new environment variable** raised by an agent: present it to Mel (justification, alternatives, size, license, personal data; for a variable: name, purpose, scope, secret yes/no), wait for her decision, then pass it on. You do not add anything without her approval either.

## Step 4 — Verification

- Run `qa`, then `security` (both review; `security` is read-only; they may run in parallel once development is finished).
- Verdict `FAIL` or `blocking`: send the defects back to the relevant agent, then re-run the verification. **Maximum 2 loops**; beyond that, explain the blocker to Mel instead of forcing it.

## Step 5 — Commits and PR

- Delegate to `git-pr`: Conventional Commits, branch push, PR to `develop` with the `qa` and `security` verdicts. Pass along the issue number from Step 1, if any, so the PR closes it.
- **Final validation gate**: give Mel the PR link and the list of points to validate. **Never merge.**

## Rules

- If an agent lacks the requested tool or fails, say so; do not pretend, and do not improvise its work without flagging it.
- At each step, summarize in 3 lines at most what was just done and what comes next.
- No step is skipped to go faster. If Mel explicitly asks to skip one, note it in the PR.
