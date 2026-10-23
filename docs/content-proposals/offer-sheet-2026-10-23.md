# Proposition — Fiche détail des offres (`locales/fr/offers.ts`)

À valider par Mel. Complète `offers-2026-10-04.md` (copie déjà validée, non reprise ici) pour l'issue #12 : il manque trois libellés pour que la fiche plein écran soit complète et accessible.

Mot-clé principal : sans objet (libellés d'interface, pas de contenu référencé). Aucun prix, aucun chiffre.
Note de ton : libellés courts, « vous » formel, aucune majuscule superflue, pas d'emoji.

## 1. Nom accessible du bouton de fermeture (icône seule)

| Clé | Texte | Notes |
|---|---|---|
| `offers.sheetCloseLabel` | Fermer la fiche | Valeur de `aria-label` du bouton « croix » de la fiche, commune aux deux offres. |

Choix : **libellé générique**, sans nom d'offre.
- Le dialogue est déjà nommé par son titre (`sheet.title`, via `aria-labelledby`), annoncé à l'ouverture : répéter l'offre dans le bouton alourdirait l'écoute sans rien apprendre.
- Une seule clé à la racine de `offers`, au lieu d'une par offre, et aucune concaténation de phrase.
- Cohérent avec le précédent `closeAriaLabel` du menu mobile dans `locales/fr/hero.ts` (« Fermer le menu ») : même verbe, même structure.

Variante écartée, si vous préférez nommer l'offre : `Fermer la fiche « {offerTitle} »`, avec `{offerTitle}` remplacé par `sheet.title` de l'offre ouverte, sur le modèle du marqueur `{assistantName}`. À éviter sauf besoin précis : le titre est long (« Vos tâches répétitives, confiées à l'IA »).

## 2. Libellés manquants dans `offers.automate.sheet`

`create.sheet` possède `gainsLabel`, `phasesLabel` et `whoLabel` ; `automate.sheet` n'en a aucun. Le composant lit ces trois clés pour les deux offres, il les faut donc aussi côté « Automatiser ».

| Clé | Texte | Statut | Notes |
|---|---|---|---|
| `offers.automate.sheet.gainsLabel` | Ce que comprend l'accompagnement | **Réutilisé à l'identique** de `create.sheet.gainsLabel` | Les quatre rubriques d'« Automatiser » (étude, mise en place, encadrement des agents IA, prise en main et suivi) sont bien un accompagnement. |
| `offers.automate.sheet.phasesLabel` | Déroulement de l'accompagnement | **Adapté** (≠ « Déroulement du projet ») | « Projet » évoque une réalisation à livrer (site, web app). Ici : observer, prioriser, mettre en place, transférer, avec un suivi possible. « Accompagnement » reprend le mot du `gainsLabel` et le registre de la carte (« je vous accompagne jusqu'à ce que vous soyez à l'aise »). |
| `offers.automate.sheet.whoLabel` | Pour qui | **Réutilisé à l'identique** de `create.sheet.whoLabel` | Neutre, convient aux deux publics. |

Résumé : deux libellés réutilisés (`gainsLabel`, `whoLabel`), un adapté (`phasesLabel`).

Si vous préférez l'uniformité stricte entre les deux fiches, `phasesLabel` peut aussi reprendre « Déroulement du projet » ; l'option adaptée est recommandée.

## 3. Autres libellés nécessaires

**Aucun.** Vérifié :
- Titre du dialogue : `sheet.title` existe pour les deux offres.
- Description du dialogue (`aria-describedby`) : `sheet.intro` joue ce rôle, il n'y a rien à écrire.
- Boutons d'action : `common.cta.book` et `common.cta.askFlo` (déjà dans `sheet.cta`).
- Ouverture depuis la carte : `offers.detailLink` (« Détail ») existe.

Point pour `nextjs-dev` (hors copie) : la numérotation des étapes (01, 02…) est générée par le composant, comme indiqué dans `offers-2026-10-04.md`.

## Points pour Mel

1. Fermeture : générique (recommandé) ou avec le nom de l'offre ?
2. `automate.sheet.phasesLabel` : « Déroulement de l'accompagnement » (adapté, recommandé) ou « Déroulement du projet » (identique à « Créer » ) ?
