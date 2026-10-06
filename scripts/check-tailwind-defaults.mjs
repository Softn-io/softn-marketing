#!/usr/bin/env node
// Flags Tailwind utilities that belong to a namespace reset by @softnio-labs/tokens and that Softn does not redefine.
// Such a class generates NOTHING (no build error), so it silently ships unstyled.
// No dependencies, Node >= 20.
//
//   node scripts/check-tailwind-defaults.mjs [dir …]     (default: app components content lib)
//
// Reset namespaces: color, text (font sizes), shadow, radius (see resetDefaults in the tokens config).
// The allowed names are read from the installed @softnio-labs/tokens/tailwind.css, so `shadow-md` and `rounded-lg`
// pass (Softn defines them) while `shadow-xl`, `rounded-2xl`, `text-lg`, `bg-white` and `bg-gray-100` fail.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join, extname, relative } from "node:path";

const require = createRequire(join(process.cwd(), "noop.js"));
let mappingPath;
try {
  mappingPath = require.resolve("@softnio-labs/tokens/tailwind.css");
} catch {
  console.error("Cannot resolve @softnio-labs/tokens/tailwind.css: install @softnio-labs/tokens first.");
  process.exit(1);
}
const mapping = readFileSync(mappingPath, "utf8");

const defined = { color: new Set(), text: new Set(), shadow: new Set(), radius: new Set() };
for (const match of mapping.matchAll(/^\s*--(color|text|shadow|radius)-([a-z0-9-]+?)(?:--[a-z-]+)?:/gm)) {
  defined[match[1]].add(match[2]);
}
const reset = new Set([...mapping.matchAll(/^\s*--([a-z-]+)-\*:\s*initial;/gm)].map((m) => m[1]));

const PALETTE = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|mauve|olive|mist|taupe|white|black";
const SIZES = { text: "xs|sm|base|lg|xl|[2-9]xl", shadow: "2xs|xs|sm|md|lg|xl|2xl", radius: "xs|sm|md|lg|xl|2xl|3xl|4xl" };
const COLOR_PREFIXES = "bg|text|border-[xytrblse]|border|ring-offset|ring|outline|divide|fill|stroke|from|via|to|decoration|accent|caret|placeholder|shadow|inset-shadow";
const RADIUS_PREFIXES = "rounded-(?:tl|tr|br|bl|ss|se|ee|es|t|r|b|l|s|e)|rounded";
const VARIANTS = String.raw`(?:[\w\[\]&>*=.,-]+:)*!?`;
const TAIL = String.raw`(?:\/[\w.\[\]%-]+)?(?![\w-])`;

const rules = [];
if (reset.has("color")) {
  rules.push({
    kind: "color",
    re: new RegExp(String.raw`(?<![\w-])${VARIANTS}(?:${COLOR_PREFIXES})-(?<name>${PALETTE})(?:-\d{2,3})?${TAIL}`, "g"),
    isAllowed: (name) => defined.color.has(name),
    hint: "Tailwind default color: use a Softn theme token (bg-base, text-foreground, border-default…)",
  });
}
for (const [ns, prefixes] of [["text", "text"], ["shadow", "shadow"], ["radius", RADIUS_PREFIXES]]) {
  if (!reset.has(ns)) continue;
  rules.push({
    kind: ns,
    re: new RegExp(String.raw`(?<![\w-])${VARIANTS}(?:${prefixes})-(?<name>${SIZES[ns]})${TAIL}`, "g"),
    isAllowed: (name) => defined[ns].has(name),
    hint: ns === "text" ? "Tailwind default font size: use a Softn type-scale step (text-title-lg, text-body-md…)" : `Tailwind default ${ns}: use a Softn ${ns} token`,
  });
}

const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mdx", ".css", ".html"]);
function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name.startsWith(".")) return [];
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return EXTENSIONS.has(extname(name)) ? [full] : [];
  });
}

const dirs = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["app", "components", "content", "lib"];
const problems = [];
for (const file of dirs.flatMap(walk)) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    for (const rule of rules) {
      for (const match of line.matchAll(rule.re)) {
        if (rule.isAllowed(match.groups.name)) continue;
        problems.push(`${relative(process.cwd(), file)}:${index + 1}  ${match[0]}  →  ${rule.hint}`);
      }
    }
  });
}

if (problems.length > 0) {
  console.error(`\n${problems.length} class(es) from a reset Tailwind namespace (they generate nothing):\n` + problems.map((p) => `  - ${p}`).join("\n") + "\n");
  process.exit(1);
}
console.log(`OK: no default-Tailwind class from a reset namespace (${[...reset].join(", ") || "none reset"}).`);
