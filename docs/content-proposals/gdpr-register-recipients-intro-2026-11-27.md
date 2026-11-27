# Proposition — introduction de la liste des destinataires (`locales/fr/legal.ts`), issue #26 (PR #170)

À valider par Mel. Une seule correction : l'introduction de la liste des destinataires. Aucun autre texte n'est modifié.

Mot-clé principal : sans objet (pages légales). Note de ton : formulation impersonnelle comme le reste de `legal.ts`, faits seulement, aucune formule de conformité.

Convention : le texte garde sa clé existante (pas de nouvelle clé, pas de concaténation). Numéros de ligne = `locales/fr/legal.ts` à la date de rédaction.

## `privacy.processors.intro` (ligne 111-112)

|         | Texte |
| ------- | ----- |
| Actuel  | Softn.io fait appel à des prestataires (sous-traitants) pour faire fonctionner le site. Ils traitent les données pour son compte : |
| Proposé | Pour faire fonctionner le site, Softn.io utilise des prestataires (sous-traitants), qui traitent les données pour son compte, ainsi qu'un logiciel de mesure d'audience auto-hébergé : |

Raison : la liste contient désormais l'entrée `privacy.processors.umami` (ligne 124-125), qui présente Umami comme un logiciel auto-hébergé sur Vercel, et non comme un prestataire. L'introduction actuelle (« des prestataires … Ils traitent les données pour son compte ») ne couvre plus cette entrée. La proposition distingue les deux : les prestataires (sous-traitants) restent ceux qui traitent les données pour le compte de Softn.io ; le logiciel auto-hébergé est nommé à part, sans le qualifier de prestataire. Une seule phrase, terminée par « : ».

### Variante

> Le site fonctionne grâce à des prestataires (sous-traitants), qui traitent les données pour le compte de Softn.io, et à un logiciel de mesure d'audience auto-hébergé :

Plus courte ; « pour le compte de Softn.io » remplace « pour son compte » afin d'éviter un pronom éloigné de son sujet.

## Points pour Mel

1. **Choix entre les deux formulations.** La proposition garde l'ordre de l'actuelle (« Softn.io … ») ; la variante place le site en sujet.
2. **Date « Dernière mise à jour ».** Le paramètre `{date}` de la politique de confidentialité est à mettre à jour à l'intégration.
3. **Source OKF.** `locales/fr/okf-sources.json` référence `legal.ts` par empreinte : à resynchroniser après intégration.
