#!/usr/bin/env bash
# pnpm-add-guard — PreToolUse · Bash
#
# Blocks any command that adds or updates a dependency, and any use of
# npm / yarn / bun to install (this project uses pnpm only).
# Every dependency request escalates to the orchestrator (/drive), which
# submits it to Mel.
#
# Blocked:
#   pnpm add <pkg> · pnpm i|install <pkg> · pnpm -F x add <pkg> · pnpm up|update|upgrade
#   npm|yarn|bun add|install|update … · bash -c "pnpm add …" · chained commands (&&, ;, |)
# Allowed without escalation:
#   pnpm install (with or without options: --frozen-lockfile, --prefer-offline…)
#   pnpm dlx shadcn@latest add <component>
#
# Input on stdin: { "tool_name": "Bash", "tool_input": { "command": "..." } }
# Exit 2 = block. stderr is surfaced to Claude.
#
# A guardrail, not a wall: it complements the `deny` rules in .claude/settings.json.

set -euo pipefail

payload=$(cat)

verdict=$(PAYLOAD="$payload" /usr/bin/env python3 -c '
import json, os, re, shlex, sys

try:
    data = json.loads(os.environ.get("PAYLOAD", ""))
except Exception:
    print("ok")
    sys.exit(0)

if data.get("tool_name") != "Bash":
    print("ok")
    sys.exit(0)

command = (data.get("tool_input") or {}).get("command") or ""

SEPARATORS = re.compile(r"&&|\|\||;|\||\n")
REDIRECTIONS = re.compile(r"\d*>>?\s*&?\S+|<\s*\S+")
WRAPPERS = {"time", "sudo", "corepack", "env", "command", "exec", "nice"}
SHELLS = {"bash", "sh", "zsh"}
VALUE_FLAGS = {
    "pnpm": {"-F", "--filter", "--filter-prod", "-C", "--dir", "--loglevel", "--reporter", "--store-dir", "--registry"},
    "npm": {"-w", "--workspace", "--prefix", "--registry", "--loglevel"},
    "yarn": set(),
    "bun": set(),
}
ADD_COMMANDS = {
    "npm": {"install", "i", "in", "ins", "add", "update", "up", "upgrade", "ci"},
    "yarn": {"add", "install", "up", "upgrade"},
    "bun": {"add", "install", "i", "update", "upgrade"},
}

def tokenize(segment):
    segment = REDIRECTIONS.sub(" ", segment).strip().lstrip("({ ")
    try:
        return shlex.split(segment)
    except ValueError:
        return segment.split()

def analyse(tool, args):
    flags_with_value = VALUE_FLAGS[tool]
    positional = []
    skip_next = False
    for arg in args:
        if skip_next:
            skip_next = False
            continue
        if arg.startswith("-"):
            if "=" not in arg and arg in flags_with_value:
                skip_next = True
            continue
        positional.append(arg)
    sub = positional[0] if positional else ""
    rest = positional[1:]
    if tool == "pnpm":
        if sub == "add":
            return "dependency"
        if sub in ("i", "install") and rest:
            return "dependency"
        if sub in ("up", "update", "upgrade"):
            return "dependency"
        return None
    if tool == "yarn" and sub == "":
        return "package-manager"
    if sub in ADD_COMMANDS[tool]:
        return "package-manager"
    return None

def check(text, depth=0):
    if depth > 3:
        return None
    for segment in SEPARATORS.split(text):
        tokens = tokenize(segment)
        while tokens and (re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", tokens[0]) or tokens[0] in WRAPPERS):
            tokens = tokens[1:]
        if not tokens:
            continue
        head = os.path.basename(tokens[0])
        if head in SHELLS:
            for index, token in enumerate(tokens[1:-1], start=1):
                if token.startswith("-") and "c" in token[1:] and not token.startswith("--"):
                    nested = check(tokens[index + 1], depth + 1)
                    if nested:
                        return nested
            continue
        if head in VALUE_FLAGS:
            result = analyse(head, tokens[1:])
            if result:
                return result
    return None

print(check(command) or "ok")
')

case "$verdict" in
  dependency)
    cat >&2 <<'MSG'
BLOCKED: adding or updating a dependency requires Mel's validation.

Escalate to the orchestrator (/drive) with a "Dependency request":
  - Package name + exact version
  - Justification (why this dependency, alternatives considered, including "no dependency")
  - Client bundle size impact (Lighthouse)
  - License check
  - Advisory status (pnpm audit)
  - Does it process personal data or load a third party? (GDPR)

Allowed without escalation:
  - "pnpm install" (with or without options: --frozen-lockfile…)
  - "pnpm dlx shadcn@latest add <component>" (then list the package.json diff in your report)
MSG
    exit 2
    ;;
  package-manager)
    cat >&2 <<'MSG'
BLOCKED: this project uses pnpm only. Do not use npm, yarn or bun to install or update packages.
Any new dependency goes through a "Dependency request" to the orchestrator (/drive).
MSG
    exit 2
    ;;
esac

exit 0
