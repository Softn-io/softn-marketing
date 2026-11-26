# Proposition — cohérence registre RGPD / politiques (`locales/fr/legal.ts`), issue #26

À valider par Mel. Deux corrections seulement, issues de l'audit `.orchestration/reports/security-audit/security-audit-26.md` (constats 5 et 6). Aucun autre texte, aucune durée de conservation, aucune autre section n'est modifié. Le formulaire de la liste d'attente n'est mentionné nulle part (décision de Mel : il est temporaire).

Mot-clé principal : sans objet (pages légales). Note de ton : formulation impersonnelle comme le reste de `legal.ts`, faits seulement, aucune formule de conformité.

Faits décrits (confirmés par Mel) : l'instance Umami auto-hébergée traite l'adresse IP du visiteur sous forme hachée, sans la conserver, pour compter les sessions et estimer une localisation approximative. Umami est un logiciel auto-hébergé sur Vercel, avec ses données dans Supabase : ce n'est pas un prestataire.

Convention : chaque texte garde sa clé existante (pas de nouvelle clé, pas de concaténation). Numéros de ligne = `locales/fr/legal.ts` à la date de rédaction.

## 1. Constat 5 : adresse IP de la mesure d'audience

### 1.1 `privacy.collected.audience` (ligne 94-95)

|         | Texte |
| ------- | ----- |
| Actuel  | Avec le consentement du visiteur : statistiques de navigation (pages consultées, type d'appareil et de navigateur) et, pour une partie des visites, données d'interaction : clics, défilement, mouvements de la souris et contenu de la page, enregistrés sous forme de cartes de chaleur et de replays. Les textes et les champs de saisie sont masqués ; l'assistant, la réservation et le formulaire de contact ne sont pas enregistrés. Ces mesures ne sont actives qu'après l'accord du visiteur. |
| Proposé | Avec le consentement du visiteur : statistiques de navigation (pages consultées, type d'appareil et de navigateur, localisation approximative) et, pour une partie des visites, données d'interaction : clics, défilement, mouvements de la souris et contenu de la page, enregistrés sous forme de cartes de chaleur et de replays. Pour compter les sessions et estimer la localisation, l'adresse IP est traitée sous forme hachée ; elle n'est pas conservée. Les textes et les champs de saisie sont masqués ; l'assistant, la réservation et le formulaire de contact ne sont pas enregistrés. Ces mesures ne sont actives qu'après l'accord du visiteur. |

Raison : la liste des données d'audience omettait l'adresse IP (aujourd'hui citée seulement pour les journaux d'hébergement et la limitation des abus), alors que le registre l'indique.

### 1.2 `cookies.audience.tracker` (ligne 189-190)

|         | Texte |
| ------- | ----- |
| Actuel  | Le premier compte les visites et les pages consultées, pour comprendre quelles parties du site sont lues. |
| Proposé | Le premier compte les visites et les pages consultées, pour comprendre quelles parties du site sont lues. Pour compter les sessions et estimer une localisation approximative, il traite l'adresse IP sous forme hachée, sans la conserver. |

Raison : la politique de cookies décrit ce que fait le traceur ; sans cette phrase, sa description serait incomplète au regard de la politique de confidentialité corrigée.

### 1.3 Clés relues et laissées inchangées

- `privacy.security.body` (ligne 150) : liste le masquage et les exclusions de l'enregistrement, pas les données collectées ; aucune énumération incomplète. Inchangée.
- `cookies.audience.body`, `heatmaps`, `replays`, `masking`, `retention` (lignes 188, 191-197) : pas d'énumération des données du traceur ; l'adresse IP relève du traceur, traité en 1.2. Inchangées.
- `privacy.purposes.audience` (ligne 107-108) : décrit la finalité (pages vues, zones cliquées, parcours), sans lister de données. Inchangée.
- `privacy.processors.umami` (ligne 124-125) : voir point 2 ci-dessous, hors périmètre de cette proposition. Inchangée.

## 2. Constat 6 : phrase des transferts

### `privacy.transfers.body` (ligne 63)

|         | Texte |
| ------- | ----- |
| Actuel  | Les données sont principalement hébergées dans l'Union européenne. Certains prestataires sont établis hors de l'Union européenne (États-Unis) : Upstash, Vercel, Umami (hébergé sur Vercel), Google et Supabase. Le transfert est alors encadré par le Data Privacy Framework (UE–États-Unis) pour les entreprises certifiées ou par des clauses contractuelles types. Baserow est un prestataire européen, sans transfert hors de l'Union européenne. Mistral AI est un prestataire européen, sans transfert hors de l'Espace économique européen, à l'exception éventuelle de la Suisse, qui bénéficie d'une décision d'adéquation de la Commission européenne. |
| Proposé | Les données sont principalement hébergées dans l'Union européenne. Certains prestataires sont établis hors de l'Union européenne (États-Unis) : Upstash, Vercel, Google et Supabase. Le transfert est alors encadré par le Data Privacy Framework (UE–États-Unis) pour les entreprises certifiées ou par des clauses contractuelles types. L'outil de mesure d'audience Umami est auto-hébergé sur Vercel, et ses données sont stockées chez Supabase. Baserow est un prestataire européen, sans transfert hors de l'Union européenne. Mistral AI est un prestataire européen, sans transfert hors de l'Espace économique européen, à l'exception éventuelle de la Suisse, qui bénéficie d'une décision d'adéquation de la Commission européenne. |

Raison : Umami est un logiciel auto-hébergé, pas un prestataire établi aux États-Unis ; les entités destinataires sont Vercel et Supabase. La phrase sur Umami est placée après les garanties (DPF / clauses contractuelles types), qui restent mot pour mot, pour ne pas séparer « Le transfert est alors encadré » de la liste qu'elle complète.

## Points pour Mel

1. **Localisation.** Le texte dit « localisation approximative », sans « pays ou ville » : je m'en tiens à ce qui m'est demandé. Si vous préférez être plus précise, remplacer par « localisation approximative (pays, ville) » en 1.1 et 1.2.
2. **`privacy.processors.umami`** (ligne 124-125) dit « Application hébergée sur Vercel (fonctions à Paris) ; transfert encadré par le Data Privacy Framework » : cohérent avec la nouvelle phrase des transferts, donc laissé tel quel.
3. **Dates « Dernière mise à jour ».** Les paramètres `{date}` de la politique de confidentialité et de la politique de cookies sont à mettre à jour à l'intégration.
4. **Source OKF.** `locales/fr/okf-sources.json` référence `legal.ts` par empreinte : à resynchroniser après intégration (comme lors du commit `b770e08`).
5. **Registre.** `docs/rgpd/processors.md` (ligne Umami) porte déjà l'IP hachée et la localisation approximative : après intégration, les deux documents disent la même chose.
