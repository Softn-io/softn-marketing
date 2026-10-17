---
description: Next.js (App Router) and Tailwind v4 developer for the softn.io site. Implements pages, sections, components, routes and configuration.
mode: primary
model: openrouter/deepseek/deepseek-v4.1-flash
permissions:
  - action: edit
    resource: "*"
    effect: allow
  - action: edit
    resource: "*.env"
    effect: deny
  - action: edit
    resource: "*.env.*"
    effect: deny
  - action: edit
    resource: ".github/*"
    effect: deny
  - action: edit
    resource: "*package.json"
    effect: deny
  - action: edit
    resource: "*pnpm-lock.yaml"
    effect: deny
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

Your full role contract is in `docs/orchestration/roles/nextjs-dev.md`. Read it entirely first and follow it.