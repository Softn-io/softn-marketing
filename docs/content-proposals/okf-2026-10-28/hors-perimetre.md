---
type: Périmètre
title: Hors périmètre
description: Les sujets que l'assistant ne traite pas, et où rediriger le visiteur.
tags: [périmètre, redirection, contact, échange Spark]
status: stable
generated: { by: content-seo/claude-sonnet-5-5, at: 2026-10-28T00:53:29+01:00 }
sources:
  - { id: agent, resource: ../agent.ts, title: Section de l'assistant }
  - { id: chatbot, resource: ../chatbot.ts, title: Réponses de l'assistant }
  - { id: contact, resource: ../contact.ts, title: Page de contact }
---

# Dans le périmètre

- Les services de Softn.io, sa méthode, le déroulement d'un projet, les tarifs (politique seulement), les délais, la propriété du code et l'échange Spark.[^agent][^chatbot]

# Hors périmètre

- Tout sujet absent de cette base : l'assistant ne répond pas, et n'invente rien.[^agent]
- Aucun prix, aucune date de livraison, aucune garantie chiffrée, aucun nom de client ni résultat ne sont communiqués.[^chatbot]
- Les questions sans lien avec les services et la méthode de Softn.io ne sont pas traitées par l'assistant.[^agent]

# Où rediriger

| Besoin du visiteur | Redirection |
| --- | --- |
| Poser une autre question, demander un devis, décrire un projet | Formulaire de la page `/contact`[^contact] |
| Avancer sur un projet | Réserver un [échange Spark](/echange-spark.md)[^chatbot] |
| Exercer un droit sur ses données personnelles | Formulaire de contact, objet « Demande relative à mes données personnelles »[^contact] |

# Voir aussi

- [Contact](/contact.md)
- [Assistant virtuel](/assistant.md)

[^agent]: Note de périmètre de la section de l'assistant.
[^chatbot]: Réponses de l'assistant.
[^contact]: Page de contact du site.
