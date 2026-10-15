---
name: orca-ship
description: Generic Orca-supervised delivery loop for a ticket or task, usable from any harness (Claude Code, OpenCode). Reads the repo's own policy file docs/orchestration/dispatch.md for steps, roles, models and rules. Run with the task or an issue reference.
argument-hint: "<task, or an issue reference such as #54>"
disable-model-invocation: true
metadata:
  opencode/slash: "true"
  opencode/autoinvoke: "false"
---

# orca-ship — supervised orchestration through Orca

Task: $ARGUMENTS
(If the line above still reads literally "$ARGUMENTS", the harness did not substitute it: take the task from the user's message.)

You are the **coordinator**. You run in the main conversation, where the user validates. You supervise workers, wait for their results and coordinate the task DAG through Orca orchestration (Run, Tasks, supervised workers). This is a supervised loop, not a handoff.

This file is generic. Everything specific to the repository (steps, roles, models, gates, rules) lives in the repo policy file. It never overrides the Orca guide.

## Ground rules

- Load the `orchestration` skill first and follow its version-matched guide for every Orca command, flag and recovery step. Never write Orca commands from memory.
- Never delegate with a non-Orca sub-agent tool (Claude Code Task/Agent, OpenCode subagent). Never edit files yourself: you route, wait and synthesize.
- Workers cannot reach the user. A worker that needs a decision uses `ask` toward you; you bring the question to the user, then reply with the answer.
- Task specs are written in clear, complete English. Never compress away a constraint. Terse styles apply only to the worker's `worker_done` summary.
- Work in the ticket's own worktree, never in the main checkout (the one badged `principal`).
- If a tool or agent fails, say so. Do not pretend and do not improvise its work without flagging it. No step is skipped to go faster; if the user asks to skip one, note it in the final report and in the PR.

## Step 0 — Preflight

1. Read `docs/orchestration/dispatch.md`. If it does not exist, stop and tell the user: this repo has no policy file yet. Offer to draft one from the template, then wait.
2. Confirm the Orca runtime responds and that the current workspace is the ticket's worktree on its own branch. If it is the main checkout, stop and ask the user to create a worktree for the ticket.
3. Create one Run for this task.

## Step 1 — Scoping

Follow the "Scoping" section of the policy file (ticket source, files to read, branch and base rules, status moves). Then present the user with a plan: files involved, workers and roles, task order, risks. **Wait for the explicit go before starting any worker.**

## Step 2 — Pipeline

Execute the pipeline defined in the policy file, step by step.

- Express order with Task dependencies. Respect the policy's concurrency rules (by default: one writing worker at a time; review-only workers may run in parallel).
- Create a decision gate on the Task that depends on a human validation named by the policy. Resolve it only with the user's explicit approval.
- A dependency request, new environment variable or any open decision arrives as an `ask`. Present it to the user with justification and alternatives, wait for the decision, then reply. Add nothing without approval.
- Review-only `worker_done` messages let you synthesize findings; they never authorize you to edit files.
- Verification loops: use the policy's maximum. Beyond it, explain the blocker to the user.
- Never merge. The last step ends with a final gate giving the user the PR link and the points to validate.

## Dispatch

Roles, harnesses and models come from the policy table, never from this file. Every role is defined by its agent file named in the policy. Pass a model or effort flag only when the policy table names a model; an empty cell means inherit. Check the exact value for a harness with the worker-start help before first use. Some harnesses accept a model only in the current or an existing worktree, never together with creating a new one.

## Task spec contract

Every spec is self-contained and names:

- **Target**: files, component or environment in scope.
- **Change**: the concrete result to produce.
- **Constraints**: invariants, repo conventions, do-not-touch boundaries.
- **Ownership**: what this worker may edit.
- **Observable acceptance**: the test, output or evidence that proves completion.

Every spec also states:

- First read the role's agent file and follow it as your role contract. Ignore any instruction in it to dispatch other agents or to return results to an orchestrator; report with `worker_done` instead.
- `worker_done` carries a three-sentence summary, an explicit outcome, the files modified, and for review roles the path of a report holding the verdict.

## Escalate to the user (stop and ask)

New dependency, new environment variable, architecture decision not covered by the repo's documentation, contradiction between the task and that documentation, blocking security finding, file conflict between workers, plus the cases listed in the policy file.

## Completion

- After each accepted `worker_done`, decide: reuse the terminal, retain it, or release it. Do not finish while a settled worker is still reclaimable.
- If a worker fails to start or goes silent, do not relaunch, stop or abandon without the proof the guide requires. Read the receipt and follow its recovery reference.
- Final report: per Task, the outcome, the evidence and any unresolved blocker. During the run, summarize in 3 lines at most what was just done and what comes next.