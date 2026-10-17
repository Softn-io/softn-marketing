# Orchestration policy — softn-marketing

Read by the `orca-ship` skill. Copy to `docs/orchestration/dispatch.md` in the repo. Change a model here, never in the skill.

## Project settings

- Default branch: `main`. Work branches are cut from `develop` and pull requests target `develop`.
- OpenCode command: `opencode2`.
- GitHub Project: owner `Softn-io`, number `2`. Status field id `PVTSSF_lAHOEQ4RlM4BlAezzhju8p4`. Status option ids: To Do `<ID>`, In Progress `<ID>`, In Review `<ID>`, Done `<ID>`.
  Find them with `gh project field-list <N> --owner <OWNER> --format json` (one-time `gh auth refresh -s project` if the scope is missing).
- Expected paths that are not scope violations in the audit: `node_modules/`, `.next/`, `.orchestration/`, `.opencode/opencode.json`, `test-results/`, `playwright-report/`.

## Scoping

- If the argument is a GitHub issue reference (`#12`, `12`, or an issue URL), run `gh issue view <number> --json title,body,labels` and use it as the scope. Keep the issue number.
- Read `CLAUDE.md` and the task context: handoff bundle, `docs/design/`, `docs/brand-voice.md`, `docs/seo-brief.md` when useful.
- The worktree already has its branch: do not create another. Check that its name follows `feat/`, `fix/` or `chore/` (issue number first when known) and that it was cut from `develop`; if not, tell the user.
- Move the issue's Project item from `To Do` to `In Progress` with `gh project item-edit` (ids above).

## Pipeline

1. **Content** (only if copy is involved). A `content-seo` worker writes the proposal in `docs/content-proposals/` and nothing else. Decision gate on the Task that integrates the copy: show the copy to the user; nothing is integrated without explicit approval.
2. **Development.** `nextjs-dev` and `chatbot-dev` as needed. One writing worker at a time; they never run concurrently.
3. **Verification.** `qa` and `security` may start in parallel: their write scopes are disjoint (qa writes only `tests/`, `e2e/` and its report; security writes only its report). Verdict `FAIL` or `blocking`: send the defects to the writing worker, then re-run the verification. Maximum 2 loops.
   - A check reported "not verifiable" by `qa` (4a-1) goes to the user as a question; it is not retried by a loop.
   - Findings of check 4a-2 (non-blocking) are listed in the PR as open questions.
4. **Commits and PR.** A `git-pr` worker: Conventional Commits, branch push, then `gh pr create --base develop` (never rely on the default base, which is `main`). The PR carries the `qa` and `security` verdicts and the issue reference as `Refs #<issue>`; it does not close the issue, because its base is not the default branch.
   After the `git-pr` worker reports success, verify yourself that the PR exists and targets `develop`, then move the issue's Project item from `In Progress` to `In Review`. Never before. Final gate. Never merge, never close the issue.

## Dispatch table

| Role | Agent file | Harness | Model | Mode |
|---|---|---|---|---|
| content-seo | `.claude/agents/content-seo.md` | claude | (blank) | writes `docs/content-proposals/` only |
| nextjs-dev | `.claude/agents/nextjs-dev.md` | claude | (blank) | writes, one writer at a time |
| chatbot-dev | `.claude/agents/chatbot-dev.md` | claude | (blank) | writes, never alongside nextjs-dev |
| qa | `.opencode/agents/qa.md` | opencode | (none: set in the agent file) | writes only `tests/`, `e2e/` and `.orchestration/reports/qa.md` |
| security | `.claude/agents/security.md` | claude | (blank) | read-only, writes only its report in `.orchestration/reports/` |
| git-pr | `.claude/agents/git-pr.md` | claude | (blank) | commits and PR, never merges |

The shared role contracts are in `docs/orchestration/roles/<role>.md`; both the Claude and the OpenCode agent files point to them.

To move a role to OpenCode: create `.opencode/agents/<role>.md` (model and permissions in its frontmatter), change Harness to `opencode` and Agent file to that path, and leave Model empty. `nextjs-dev` stays on `claude` until a replay on an already merged PR shows that its OpenCode model produces acceptable work.

## Harness rules

- `opencode` roles: never pass `--model` or `--agent`; the agent comes from `.opencode/agents/<role>.md`, selected by the launch recipe in the skill.
- At most one OpenCode role at a time per worktree (the runtime file is reloaded while running). Several workers of the same role may run in parallel. Different OpenCode roles in parallel need different worktrees.
- Hooks defined for Claude Code (`.claude/settings.json`) do not run under OpenCode. For OpenCode workers, the prohibitions are carried by the permissions in the agent file, by the role contract and by the coordinator's write-scope audit.

## Extra escalations

- Any change touching environment variables or deployment configuration.
- Any copy that contradicts `docs/brand-voice.md`.
- Any change to `package.json`, the lockfile, `.env*` or `.github/` made outside an approved dependency request.

## Repo rules

- `.gitignore` must contain `.orchestration/` and `.opencode/opencode.json`.
- Some rules in `CLAUDE.md` address the main conversation or the coordinator (for example "the main conversation does not write app code", "go through /ship"). Workers must not apply them to themselves; each role contract says so.