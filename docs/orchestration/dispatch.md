# Orchestration policy — softn-marketing

Read by the `orca-ship` skill. Copy to `docs/orchestration/dispatch.md` in the repo. Change a model here, never in the skill.

## Scoping

- If the argument is a GitHub issue reference (`#12`, `12`, or an issue URL), run `gh issue view <number> --json title,body,labels` and use it as the scope. Keep the issue number.
- Read `CLAUDE.md` and the task context: handoff bundle, `docs/design/`, `docs/brand-voice.md`, `docs/seo-brief.md` when useful.
- The worktree already has its branch: do not create another. Check that its name follows `feat/`, `fix/` or `chore/` (issue number first when known) and that it was cut from `develop`; if not, tell the user.
- Move the issue from `To Do` to `In Progress` on GitHub.

## Pipeline

1. **Content** (only if copy is involved). A `content-seo` worker writes the proposal in `docs/content-proposals/` and nothing else. Decision gate on the Task that integrates the copy: show the copy to the user; nothing is integrated without explicit approval.
2. **Development.** `nextjs-dev` and `chatbot-dev` as needed. One writing worker at a time; they never run concurrently.
3. **Verification.** `qa` and `security` start in parallel, review-only. Verdict `FAIL` or `blocking`: send the defects to the writing worker, then re-run the verification. Maximum 2 loops.
4. **Commits and PR.** A `git-pr` worker: Conventional Commits, branch push, PR to `develop` carrying the `qa` and `security` verdicts and the issue number, so the PR closes the issue. Final gate. Never merge.

## Dispatch table

| Role | Agent file | Harness | Model | Mode |
|---|---|---|---|---|
| content-seo | `.claude/agents/content-seo.md` | claude | (blank) | writes `docs/content-proposals/` only |
| nextjs-dev | `.claude/agents/nextjs-dev.md` | claude | (blank) | writes, one writer at a time |
| chatbot-dev | `.claude/agents/chatbot-dev.md` | claude | (blank) | writes, never alongside nextjs-dev |
| qa | `.claude/agents/qa.md` | claude | (blank) | review-only |
| security | `.claude/agents/security.md` | claude | (blank) | review-only |
| git-pr | `.claude/agents/git-pr.md` | claude | (blank) | commits and PR, never merges |

First iteration: every worker stays on `claude` with no model override, to validate the loop. To move a role to OpenCode, set Harness to the value shown by the worker-start help and Model to a `provider/model-id`. Start with `qa` (review-only, lowest risk).

## Extra escalations

- Any change touching environment variables or deployment configuration.
- Any copy that contradicts `docs/brand-voice.md`.

## Repo rules

- Hooks defined for Claude Code do not apply to workers on other harnesses. For those workers, restate the relevant prohibitions in the Task spec Constraints.