# Orchestration policy — softn-marketing

Read by the `ship` skill. Copy to `docs/orchestration/dispatch.md` in the repo. Change a model here, never in the skill.

## Project settings

- Default branch: `main`. Work branches are cut from `develop` and pull requests target `develop`.
- OpenCode command: `opencode2`.
- Terminal screen command: `orca terminal read --terminal <handle> --json`. The current agent and model are on the prompt box line in `result.terminal.tail`: the last line that starts with `┃` and contains  `·` , located just above the `▀▀▀` border line (for example `┃  Security-Audit · GLM-5.3 OpenRouter`). Compare the agent name with `<role>`, ignoring case. Ignore every other line of the tail: earlier messages and the picker list also show agent names.
- Orca CLI absolute path: `/Applications/Orca.app/Contents/Resources/bin/orca`. Workers must call Orca with this path and never search the filesystem for it.
- GitHub Project: owner `Softn-io`, number `2`. Status field id `PVTSSF_lAHOEQ4RlM4BlAezzhju8p4`. Status option ids: To Do `<ID>`, In Progress `<ID>`, In Review `<ID>`, Done `<ID>`.
Find them with `gh project field-list <N> --owner <OWNER> --format json` (one-time `gh auth refresh -s project` if the scope is missing).
- Expected paths that are not scope violations in the audit: `node_modules/`, `.next/`, `.orchestration/`, `.opencode/opencode.json`, `test-results/`, `playwright-report/`, `tsconfig.tsbuildinfo`.

## Scoping

- If the argument is a GitHub issue reference (`#12`, `12`, or an issue URL), run `gh issue view <number> --json title,body,labels` and use it as the scope. Keep the issue number.
- Read `CLAUDE.md` and the task context: handoff bundle, `docs/design/`, `docs/brand-voice.md`, `docs/seo-brief.md` when useful.
- The worktree already has its branch: do not create another. Check that its name follows `feat/`, `fix/` or `chore/` (issue number first when known) and that it was cut from `develop`; if not, modify the branch name (always in English) and tell the user.
- Move the issue's Project item from `To Do` to `In Progress` with `gh project item-edit` (ids above).

## Pipeline

1. **Content** (only if copy is involved). A `content-seo` worker writes the proposal in `docs/content-proposals/` and nothing else. Decision gate on the Task that integrates the copy: show the copy to the user; nothing is integrated without explicit approval.
2. **Development.** `nextjs-dev` and `chatbot-dev` as needed. One writing worker at a time; they never run concurrently.
3. **Verification.** `qa` and `security-audit` run in parallel in the same worktree: their write scopes are disjoint (qa writes colocated tests under `components/`, `lib/`, `hooks/`, `schemas/`, `actions/`, `app/*.test.ts(x)`, `e2e/` and `.orchestration/reports/qa/qa-<issue-number>.md`; security-audit writes only `.orchestration/reports/security-audit/security-audit-<issue-number>.md`). If the agent of one of them cannot be confirmed in the picker and the fallback recipe is used, only one OpenCode role may run per worktree: run the second one in a second worktree (a detached checkout of the ticket branch's current commit, only if everything to review is committed) or one after the other. Say in the plan which case applies.

   Verdict `FAIL` or `blocking`: send the defects to the writing worker, then re-run the verification. Maximum 2 loops.
   - A check reported "not verifiable" by `qa` (4a-1) goes to the user as a question; it is not retried by a loop.
   - Findings of check 4a-2 (non-blocking) are listed in the PR as open questions.
4. **Commits and PR.** A `git-pr` worker: Conventional Commits, branch push, then `gh pr create --base develop` (never rely on the default base, which is `main`). The PR carries the `qa` and `security-audit` verdicts and the issue reference as `Refs #<issue>`; it does not close the issue, because its base is not the default branch.
After the `git-pr` worker reports success, verify yourself that the PR exists and targets `develop`, then move the issue's Project item from `In Progress` to `In Review`. Never before. Final gate. Never merge, never close the issue.

## Dispatch table


| Role           | Agent file                           | Harness   | Model                         | Mode                                                                                                                                                        |
| -------------- | ------------------------------------ | --------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| content-seo    | `.claude/agents/content-seo.md`      | claude    | sonnet                        | writes `docs/content-proposals/` only                                                                                                                       |
| nextjs-dev     | `.opencode/agents/nextjs-dev.md`     | opencode2 | (none: set in the agent file) | writes, one writer at a time                                                                                                                                |
| chatbot-dev    | `.opencode/agents/chatbot-dev.md`    | opencode2 | (none: set in the agent file) | writes, never alongside nextjs-dev                                                                                                                          |
| qa             | `.opencode/agents/qa.md`             | opencode2 | (none: set in the agent file) | colocated tests under `components/`, `lib/`, `hooks/`, `schemas/`, `actions/`, `app/*.test.ts(x)`, `e2e/`, `.orchestration/reports/qa/qa-<issue-number>.md` |
| security-audit | `.opencode/agents/security-audit.md` | opencode2 | (none: set in the agent file) | read-only, writes only its report in `.orchestration/reports/security-audit/security-audit-<issue-number>.md`                                               |
| git-pr         | `.claude/agents/git-pr.md`           | claude    | haiku                         | commits and PR, never merges                                                                                                                                |


The shared role contracts are in `docs/orchestration/roles/<role>.md`; both the Claude and the OpenCode agent files point to them.

To move a role to OpenCode: create `.opencode/agents/<role>.md` (model and permissions in its frontmatter), change Harness to `opencode` and Agent file to that path, and leave Model empty. `nextjs-dev` stays on `claude` until a replay on an already merged PR shows that its OpenCode model produces acceptable work.

## Harness rules

- `opencode` roles: never pass `--model` or `--agent`; the agent comes from `.opencode/agents/<role>.md`, selected in the OpenCode `/agents` picker by the launch recipe in the skill, and confirmed on screen before any worker starts.
- Different OpenCode roles may run in parallel in the same worktree, because each TUI holds its own agent. This does not apply to the fallback recipe, which uses a shared runtime file (see Pipeline, step 3).
- Hooks defined for Claude Code (`.claude/settings.json`) do not run under OpenCode. For OpenCode workers, the prohibitions are carried by the permissions in the agent file, by the role contract and by the coordinator's write-scope audit.

## Extra escalations

- Any change touching environment variables or deployment configuration.
- Any copy that contradicts `docs/brand-voice.md`.
- Any change to `package.json`, the lockfile, `.env*` or `.github/` made outside an approved dependency request.

## Repo rules

- `.opencode/opencode.json` is written only by the fallback recipe. Keep it out of the repo normally (and gitignored); a leftover `default_agent` there would switch a running TUI the next time it is rewritten.  
`.gitignore` must contain `.orchestration/` and `.opencode/opencode.json`.
- Some rules in `CLAUDE.md` address the main conversation or the coordinator (for example "the main conversation does not write app code", "go through /ship"). Workers must not apply them to themselves; each role contract says so.