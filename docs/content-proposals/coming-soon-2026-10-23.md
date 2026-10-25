# Proposition — Page « bientôt en ligne » (`/`) et métadonnées de `/preview`

À valider par Mel. Issue #86. Remplace le texte provisoire « Coming soon -> To be created by content-seo agent ».

Mot-clé principal : **automatisation** (secondaire : **agents IA**). Périmètre : toute la France. Le brief SEO (`docs/seo-brief.md`) n'existe pas encore : les mots-clés viennent de `CLAUDE.md`, de `docs/brand-voice.md` et de `locales/fr/metadata.ts`. Aucun volume de recherche mesuré.

Note de ton : « je » (Mel) et « vous », phrases courtes, aucun emoji, aucune date de lancement, aucun chiffre, aucune promesse. Le logo texte (`softn` + `.io`) est repris tel quel de `locales/fr/hero.ts` (`nav.logo`) : rien à réécrire.

## 1. Pastille (eyebrow)

| Clé | Texte | Longueur | Justification |
|---|---|---|---|
| `comingSoon.eyebrow` | Bientôt en ligne | 16 car. | Dit l'essentiel en trois mots, sans date ni promesse. |

## 2. Titre principal (unique `<h1>`)

| Clé | Variante | Texte | Longueur | Justification |
|---|---|---|---|---|
| `comingSoon.title` | **A (recommandée)** | Sites, web apps, automatisations et agents IA : mon site arrive bientôt. | 72 car. | Dit ce que fait Softn (offre + mots-clés « automatisation », « agents IA ») et que le site arrive, à la première personne comme le reste du site. |
| `comingSoon.title` | B | Votre site, vos apps et vos automatisations : le nouveau site de Softn.io arrive bientôt. | 89 car. | Part du lecteur (« votre ») dans l'esprit du hero, mais plus long et sans « agents IA » : moins bon pour le SEO. |

## 3. Phrase d'appui

| Clé | Variante | Texte | Mots | Justification |
|---|---|---|---|---|
| `comingSoon.body` | **A (recommandée)** | Je crée des sites et des web apps, et j'automatise vos tâches répétitives avec des agents IA. Ce site est en cours de finalisation. | 24 | Concret d'abord (tâches répétitives, formulation déjà validée dans la description d'accueil), et honnête sur l'état du site. |
| `comingSoon.body` | B | Je conçois votre site, vos applications et vos automatisations, avec des agents IA relus par un humain à chaque étape. Le site complet ouvre prochainement. | 26 | Reprend la garantie de relecture humaine du hero ; « prochainement » ne fixe aucune date. |

Pas de CTA « Réserver mon échange Spark » : la réservation n'est pas ouverte sur cette page.

## 4. Ligne de contact (facultative)

Aucune adresse e-mail, aucun téléphone n'existe dans `locales/fr/` : je n'en propose aucun.

Un canal validé existe : la page `/contact` (formulaire) et son titre « Écrivez-moi. » (`locales/fr/contact.ts`, `contact.title`). Proposition : un simple lien reprenant ce libellé existant, **sans nouveau texte**.

| Clé | Texte | Longueur | Justification |
|---|---|---|---|
| `comingSoon.contactLink` | Écrivez-moi. | 12 car. | Libellé déjà validé (`contact.title`) ; à réutiliser par référence. |

À décider par Mel / `nextjs-dev` : n'afficher ce lien que si la route `/contact` est bien en ligne avec `/` en production (elle n'existe pas encore dans `app/` sur cette branche). Sinon, ne rien afficher.

## 5. Métadonnées de `/` (indexée : `index, follow`)

| Clé | Texte | Longueur |
|---|---|---|
| `comingSoon.meta.title` | Softn.io \| Automatisation et agents IA, bientôt en ligne | 56 car. |
| `comingSoon.meta.description` | Je crée votre site et vos web apps, et j'automatise vos tâches répétitives avec des agents IA. Le site complet de Softn.io arrive bientôt. | 138 car. |
| `comingSoon.meta.openGraph.title` | Softn.io : sites, web apps, automatisation et agents IA | 55 car. |
| `comingSoon.meta.openGraph.description` | Création de sites et d'applications, automatisation avec des agents IA. Le site complet de Softn.io arrive bientôt. | 115 car. |

Justification : mots-clés « automatisation » et « agents IA » en tête de `title`, cohérents avec `metadataContent.home` ; la mention « bientôt en ligne » reste honnête. Ni « TPE et PME » ni « Échange Spark » ici, car l'offre n'est pas encore réservable. Longueurs comptées au caractère près ; à recompter au lint.

## 6. Métadonnées de `/preview` (`noindex`, hors sitemap)

| Clé | Texte | Longueur | Justification |
|---|---|---|---|
| `preview.meta.title` | Aperçu \| Softn.io | 17 car. | Court, interne ; la page n'est pas indexée, aucune description nécessaire. |

## Points pour Mel

- Choisir les variantes du titre (A ou B) et de la phrase d'appui (A ou B).
- Confirmer le lien « Écrivez-moi. » vers `/contact`, ou aucun lien.
- Hypothèse : le titre de `/` est volontairement différent de `metadataContent.home` tant que le site complet n'est pas en ligne ; à rétablir au lancement.
