# Voice and tone — Softn.io (v1)

> Version 1, based on Mel's choices. Sections marked "to validate" or "to complete" are proposals to confirm.
> Read by `content-seo` before any copy, and by `chatbot-dev` for the chatbot.
> This document is in English; **the site copy it governs is written in French**, and the examples below are in French on purpose.

## Positioning

**An accessible expert.** Someone competent who meets the reader at their level and never talks down to them. Mel speaks for herself on the site: the reader is talking to a person, not to a brand.

## Decisions made

| Topic | Decision |
|---|---|
| Address | **Formal "vous" everywhere**: site, chatbot, reminder emails, error messages |
| Who speaks | **"Je"** (Mel), owned and personal |
| Register | **Warm and human** + **expert and reassuring** |
| Way of talking about AI | **Pragmatic**: concrete gains, zero hype |
| Emojis | Chatbot only, **very rare**; never on the site |
| Chatbot | An assistant with a **first name**: `<Prénom>` (to be chosen) |

## Writing principles

- Start from the **reader's daily reality** (« vous perdez du temps à… ») before talking about a solution.
- **Short sentences**, action verbs, one message per paragraph.
- A technical term is used only if explained in one line.
- **Warmth**: talk about people, exchange, support. **Reassurance**: show the framework (30 free minutes, action plan in return, set up with you, no jargon).
- **Pragmatic AI**: the concrete task and benefit first, the technology after.
- Tools are named when they help explain what Mel sets up (Claude Code, Make).

## What to say, what to avoid

| Prefer | Avoid |
|---|---|
| « Je mets en place… », « Nous définissons ensemble… » (see note) | « Nous sommes une équipe de… » (the site speaks as "je") |
| « Vos demandes entrantes sont triées et saisies automatiquement » | « Un agent IA propulsé par LLM » |
| « Automatisation », « agents IA », « workflows » | « Révolutionnaire », « disruptif », « game changer », « magique » |
| « Appel découverte de 30 minutes » | « Consultation stratégique » |
| « Création de sites et de web apps » | « Site vitrine » (banned word) |

**To validate** — Note: « nous » is acceptable to mean "you and me together" (« nous définissons ensemble votre priorité »); it must never suggest a team that does not exist.

## Credibility guardrails

- No invented figure, percentage, testimonial, client name or result. A number is published only if it is real and can be sourced.
- No prices displayed.
- No absolute promise (« zéro erreur », « 100 % automatisé »).
- AI is presented for what it does today, with its limits when useful.

## Tone examples (illustrations, not final copy)

- « Vous recopiez les mêmes informations d'un outil à l'autre ? Je mets en place l'automatisation qui s'en charge. »
- « On prend 30 minutes pour comprendre votre quotidien, et vous repartez avec un plan d'action. »
- « Un agent IA trie vos demandes entrantes et met à jour votre suivi. Moins de saisie, moins d'oublis. »

**Calls to action**: concrete verbs, first person on the reader's side.
« Réserver mon appel découverte » · « Voir ce que je peux automatiser » · « Poser ma question ».

## Chatbot

- Formal "vous", same warm and expert tone. Short answers (2 to 3 sentences), one question at a time.
- **Mandatory first message**: discloses a virtual assistant, with its first name. Shape:
  « Bonjour, je suis `<Prénom>`, l'assistant virtuel de Softn. Je peux répondre à vos questions et vous aider à réserver un appel. »
- Never presented as human. If it cannot answer, it says so and offers to book a call with Mel.
- **Before** asking for a name or email: explain why, ask for explicit consent, link to the privacy policy.
- Emojis: at most one, rarely, never in error or consent messages.
- The first name lives in **a single constant** (`locales/fr/chatbot.ts`): changing it touches one line.

## Editorial SEO

- Starting keywords: **automatisation**, **agents IA** (and close variants). All of France. Detailed study: `docs/seo-brief.md`.
- A single H1 per page; the section's primary keyword in the subheading and the first sentence, **naturally**. Readability beats keyword.
- `title` ≲ 60 characters, `meta description` ≲ 155; same tone as the body copy.
- A single page limits the number of queries targeted: future pages (guides, use cases) will carry SEO in the long run.

## To complete by Mel

- Style references: sites or sentences Mel likes, and ones she dislikes.
- Words to always use, words to ban beyond those above.
- The assistant's first name.
