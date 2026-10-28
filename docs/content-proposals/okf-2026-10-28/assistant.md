---
type: Assistant
title: Assistant virtuel du site
description: Un assistant virtuel fonctionnant avec l'IA, pas une personne, qui répond sur les services et la méthode de Softn.io et aide à réserver un échange.
tags: [assistant, IA, périmètre, transparence, données personnelles]
status: stable
generated: { by: content-seo/claude-sonnet-5-5, at: 2026-10-28T00:53:29+01:00 }
sources:
  - { id: chatbot, resource: ../chatbot.ts, title: Textes de l'assistant }
  - { id: agent, resource: ../agent.ts, title: Section de l'assistant }
  - { id: thisSite, resource: ../thisSite.ts, title: Les coulisses du site }
  - { id: legal, resource: ../legal.ts, title: Politique de confidentialité }
---

# Nature

- L'assistant est un assistant virtuel fonctionnant avec l'intelligence artificielle. Ce n'est pas une personne.[^chatbot]
- Si un échange Spark est réservé, la demande est lue avant le rendez-vous.[^chatbot]

# Périmètre

- Il répond aux questions sur les services et la méthode de Softn.io, et aide à réserver l'échange Spark.[^chatbot][^agent]
- Hors de ce périmètre, il propose de réserver un échange.[^agent]
- Il ne prend aucune décision concernant les personnes.[^legal]

# Données personnelles

- Aucune donnée personnelle n'est demandée avant le consentement explicite du visiteur.[^thisSite]
- La collecte de données personnelles n'a lieu que pour réserver un échange Spark, après ce consentement.[^chatbot]
- Les données saisies lors d'une réservation ne servent pas à entraîner un modèle d'intelligence artificielle.[^legal]

# Voir aussi

- [Échange Spark](/echange-spark.md)
- [Hors périmètre](/hors-perimetre.md)

[^chatbot]: Textes et réponses de l'assistant.
[^agent]: Note de périmètre de la section de l'assistant.
[^thisSite]: Étape « L'assistant du site » des coulisses du site.
[^legal]: Politique de confidentialité, rubrique « Assistant virtuel ».
