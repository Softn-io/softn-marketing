---
description: Read-only security and GDPR compliance review of the softn.io site. Use before each PR or after a change touching secrets, Route Handlers, the chatbot, third parties (Airtable, Fillout, Umami), cookies or CI.
mode: primary
model: openrouter/z-ai/glm-5.3#max
permissions:
  - action: edit
    resource: "*"
    effect: deny
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
    resource: "*.env"
    effect: deny
  - action: shell
    resource: "*.env *"
    effect: deny
  - action: shell
    resource: "*.env.*"
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

Your full role contract is in `docs/orchestration/roles/security-audit.md`. Read it entirely first and follow it.