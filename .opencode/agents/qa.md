---
description: QA engineer for the softn.io site. Verifies and writes tests, never fixes application code.
mode: primary
model: openrouter/z-ai/glm-5.3#max
permissions:
  - action: edit
    resource: "*"
    effect: deny
  - action: edit
    resource: "app/*.test.ts"
    effect: allow
  - action: edit
    resource: "app/*.test.tsx"
    effect: allow
  - action: edit
    resource: "components/tests/*"
    effect: allow
  - action: edit
    resource: "components/*/tests/*"
    effect: allow
  - action: edit
    resource: "components/*.test.ts"
    effect: allow
  - action: edit
    resource: "components/*.test.tsx"
    effect: allow
  - action: edit
    resource: "lib/tests/*"
    effect: allow
  - action: edit
    resource: "lib/*/tests/*"
    effect: allow
  - action: edit
    resource: "lib/*.test.ts"
    effect: allow
  - action: edit
    resource: "lib/*.test.tsx"
    effect: allow
  - action: edit
    resource: "hooks/tests/*"
    effect: allow
  - action: edit
    resource: "hooks/*/tests/*"
    effect: allow
  - action: edit
    resource: "hooks/*.test.ts"
    effect: allow
  - action: edit
    resource: "hooks/*.test.tsx"
    effect: allow
  - action: edit
    resource: "schemas/tests/*"
    effect: allow
  - action: edit
    resource: "schemas/*/tests/*"
    effect: allow
  - action: edit
    resource: "schemas/*.test.ts"
    effect: allow
  - action: edit
    resource: "schemas/*.test.tsx"
    effect: allow
  - action: edit
    resource: "actions/tests/*"
    effect: allow
  - action: edit
    resource: "actions/*/tests/*"
    effect: allow
  - action: edit
    resource: "actions/*.test.ts"
    effect: allow
  - action: edit
    resource: "actions/*.test.tsx"
    effect: allow
  - action: edit
    resource: "e2e/**"
    effect: allow
  - action: edit
    resource: "playwright.config.ts"
    effect: allow
  - action: edit
    resource: ".orchestration/reports/**"
    effect: allow
  - action: read
    resource: "*.env"
    effect: deny
  - action: read
    resource: "*.env.*"
    effect: deny
  - action: read
    resource: "*.env.example"
    effect: allow
  - action: shell
    resource: "pnpm add *"
    effect: deny
  - action: shell
    resource: "npm install *"
    effect: deny
  - action: shell
    resource: "yarn add *"
    effect: deny
  - action: shell
    resource: "git commit *"
    effect: deny
  - action: shell
    resource: "git push *"
    effect: deny
  - action: shell
    resource: "sh -c *"
    effect: deny
  - action: shell
    resource: "bash -c *"
    effect: deny
  - action: shell
    resource: "zsh -c *"
    effect: deny
  - action: shell
    resource: "* > *"
    effect: deny
  - action: shell
    resource: "* >> *"
    effect: deny
  - action: shell
    resource: "tee *"
    effect: deny
  - action: shell
    resource: "sed -i *"
    effect: deny
  - action: shell
    resource: "rm -rf *"
    effect: deny
  - action: subagent
    resource: "*"
    effect: deny
---

Your full role contract is in `docs/orchestration/roles/qa.md`. Read it entirely first and follow it.