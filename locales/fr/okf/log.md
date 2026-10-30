# Journal de la base de connaissances

## 2026-10-30

- **Maintenance**: Les empreintes SHA-256 des sources de `locales/fr/` citées par les concepts sont désormais consignées dans `locales/fr/okf-sources.json`. L'état actuel de `legal.ts`, `agent.ts` et `chatbot.ts`, modifiés le 2026-10-28 après la vérification, est accepté comme relu par Mel et sert de référence (`reviewedAt` au 2026-10-28T01:42:38+01:00). Désormais, toute modification d'une source fait échouer le test `lib/assistant/okfSources.test.ts` jusqu'à la relecture des concepts concernés et la mise à jour de la base.

## 2026-10-28

- **Integration**: Base validée par Mel le 2026-10-28 et intégrée dans `locales/fr/okf/`. Chaque concept porte désormais `verified` (`human:mel`, `2026-10-28T01:42:38+01:00`). La description de `automatisation.md` est mise entre guillemets pour rester un frontmatter YAML valide ; aucun contenu n'est modifié.
- **Creation**: Création de la base à partir des textes validés de `locales/fr/` (offres, méthode, FAQ, chatbot, accueil, coulisses du site, contact, mentions légales). Proposition soumise à la validation.
- **Revision**: Seconde version. L'assistant parle de Softn.io, sans nommer de personne. Le positionnement met en avant les applications, les agents IA et l'automatisation ; les sites web restent cités là où les textes sources les mentionnent. Descriptions, étiquettes et ordre des concepts revus en conséquence. Horodatage `generated.at` mis à jour pour tous les concepts. Aucun fait ajouté : tout provient de `locales/fr/`.
