# Proposition — suites de revue, cohérence registre RGPD / politiques (`locales/fr/legal.ts`), issue #26 (PR #170)

À valider par Mel. Deux corrections seulement, issues de la revue `.orchestration/reports/code-review/code-review-26.md` (constats 1 et 2). Aucun autre texte n'est modifié.

Mot-clé principal : sans objet (pages légales). Note de ton : formulation impersonnelle comme le reste de `legal.ts`, faits seulement, aucune formule de conformité.

Convention : chaque texte garde sa clé existante (pas de nouvelle clé, pas de concaténation). Numéros de ligne = `locales/fr/legal.ts` à la date de rédaction.

## 1. Constat 1 : Umami n'est pas un prestataire

### `privacy.processors.umami` (ligne 124-125)

|         | Texte |
| ------- | ----- |
| Actuel  | Umami : mesure d'audience, cartes de chaleur et replays de sessions, chargés uniquement après le consentement du visiteur. Application hébergée sur Vercel (fonctions à Paris) ; transfert encadré par le Data Privacy Framework (UE–États-Unis). |
| Proposé | Umami : mesure d'audience, cartes de chaleur et replays de sessions, chargés uniquement après le consentement du visiteur. Logiciel auto-hébergé sur Vercel, dont les données sont stockées chez Supabase (voir les entrées Vercel et Supabase). |

Raison : la liste est introduite par « des prestataires (sous-traitants) … Ils traitent les données pour son compte », or Umami est un logiciel auto-hébergé, pas un prestataire ; les destinataires réels sont Vercel (hébergement, Data Privacy Framework) et Supabase (stockage, clauses contractuelles types), déjà listés. La clause de transfert propre à Umami est retirée : les garanties figurent dans ces deux entrées et dans `privacy.transfers.body` (ligne 63), qui dit déjà qu'Umami est auto-hébergé sur Vercel avec ses données chez Supabase. La finalité et la condition du consentement sont conservées.

## 2. Constat 2 : fenêtre de limitation du débit de la réservation

### `privacy.retention.rateLimit` (ligne 137-138)

|         | Texte |
| ------- | ----- |
| Actuel  | Données de limitation du débit : 60 secondes pour l'assistant et 10 minutes pour le formulaire de contact. Identifiants de la vérification anti-robot : 10 minutes. |
| Proposé | Données de limitation du débit : 60 secondes pour l'assistant et la réservation, 10 minutes pour le formulaire de contact. Identifiants de la vérification anti-robot : 10 minutes. |

Raison : les routes de réservation utilisent aussi la fenêtre de 60 secondes ; la durée affichée omettait ce périmètre. Le reste de la phrase est repris mot pour mot.

## Points pour Mel

1. **Ponctuation en 2.** Le texte actuel dit « … et 10 minutes pour le formulaire de contact » ; la proposition remplace « et » par une virgule devant « 10 minutes » pour ne pas enchaîner deux « et » (« l'assistant et la réservation, 10 minutes … »). Si vous préférez la tournure la plus proche de l'actuelle : « 60 secondes pour l'assistant et la réservation, et 10 minutes pour le formulaire de contact ».
2. **Date « Dernière mise à jour ».** Le paramètre `{date}` de la politique de confidentialité est à mettre à jour à l'intégration.
3. **Source OKF.** `locales/fr/okf-sources.json` référence `legal.ts` par empreinte : à resynchroniser après intégration (comme lors du commit `99cdaab`).
