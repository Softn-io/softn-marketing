---
type: Qualité
title: Qualité et relecture
description: Chaque livrable est relu et validé par un humain avant livraison ; ce qui ne convient pas retourne aux agents.
tags: [qualité, relecture, fiabilité, IA, validation]
status: stable
generated: { by: content-seo/claude-sonnet-5-5, at: 2026-10-28T00:53:29+01:00 }
verified: [{ by: "human:mel", at: "2026-10-28T01:42:38+01:00" }]
sources:
  - { id: method, resource: ../method.ts, title: Section méthode }
  - { id: faq, resource: ../faq.ts, title: Questions fréquentes }
  - { id: chatbot, resource: ../chatbot.ts, title: Réponses de l'assistant }
  - { id: thisSite, resource: ../thisSite.ts, title: Les coulisses du site }
---

# Principe

- Chaque livrable est relu et validé avant d'être livré.[^method]
- Les agents IA accélèrent la production, mais la validation reste humaine : c'est elle qui contribue à la qualité de ce que le client reçoit.[^method]
- Un livrable non conforme est renvoyé aux agents pour correction.[^method]

# L'IA est-elle fiable ?

- Les agents accélèrent, mais Softn.io relit et valide chaque livrable. Le client obtient la vitesse de l'IA avec la rigueur d'un développement suivi.[^faq]
- Si une tâche ne peut pas être confiée à l'IA, Softn.io le dit au client.[^faq]

# Pourquoi des étapes courtes

- Le découpage en tâches courtes rend la relecture plus fiable et le suivi plus clair.[^method]
- Cette double étape (production puis relecture) permet de repérer les erreurs tôt et de les corriger avant qu'elles n'atteignent le projet.[^chatbot]

# Exemple : ce site

- Sur ce site, le code a été écrit par des agents IA spécialisés, avec une branche par tâche ; la relecture et la fusion sont faites par un humain.[^thisSite]
- À chaque itération, le design comme le code ont été relus, et les points relevés ont été repris.[^thisSite]

# Voir aussi

- [Méthode](/methode.md)
- [Automatisation](/automatisation.md)

[^method]: Section méthode du site.
[^faq]: Questions fréquentes du site.
[^chatbot]: Réponse « Comment la qualité du travail est-elle contrôlée ? » de l'assistant.
[^thisSite]: Section « Les coulisses de ce site ».
