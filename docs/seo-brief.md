# Brief SEO — softn.io

Version du 2026-10-26. À valider par Mel. Destiné à `nextjs-dev` (intégration) et `content-seo` (rédaction).

**Aucun volume de recherche n'a été mesuré.** Aucune donnée d'outil SEO ni étude de concurrence n'a été consultée pour ce brief : les mots-clés viennent de `CLAUDE.md`, de `docs/brand-voice.md` et du vocabulaire des offres validées. Tout terme marqué « hypothèse » est à confirmer avant d'y investir une page. Aucun chiffre n'est avancé.

## 1. Cibles

- TPE et PME
- Petites équipes de développement
- Indépendants et entrepreneurs solo
- Startups non techniques

Périmètre géographique : **toute la France**, prestation 100 % à distance possible. **Pas de SEO local** : pas de ville, pas de Google Business Profile, pas de mention d'adresse (voir § 7).

## 2. Mots-clés

| Rang | Terme | Statut |
|---|---|---|
| Principal | **automatisation** | Décidé (Mel) |
| Secondaire | **agents IA** | Décidé (Mel) |
| Secondaire (hypothèse) | automatisation des tâches répétitives | Issu des textes validés ; volume non mesuré |
| Secondaire (hypothèse) | automatisation pour TPE / PME | Cohérent avec le titre validé ; volume non mesuré |
| Secondaire (hypothèse) | création de site web, création de web app | Deuxième pilier de l'offre ; volume non mesuré |
| Longue traîne (hypothèse) | automatiser les relances / devis / factures / tri de boîte mail | Exemples cités dans les offres ; à confirmer |
| Longue traîne (hypothèse) | encadrer l'usage des agents IA en équipe de développement | Offre « Claude Code » ; niche, concurrence inconnue |
| Longue traîne (hypothèse) | agent IA pour une petite entreprise | À tester |

Règles d'usage : le mot-clé principal apparaît naturellement dans le `title`, le `h1` ou le sous-titre, et la première phrase de la page. Jamais de bourrage ; la lisibilité prime (voir `docs/brand-voice.md`). Respecter le lexique de `docs/brand-voice.md` (mots bannis inclus).

## 3. Intention de recherche par page

| Page | État | Intention visée | Rôle SEO |
|---|---|---|---|
| `/` écran « bientôt en ligne » | En ligne aujourd'hui | Navigationnelle (le visiteur cherche Softn.io) et découverte | Poser la marque et le thème (automatisation, agents IA) ; collecter les e-mails. Contenu mince : on n'attend pas de trafic générique |
| `/` one-page complète | Plus tard | Commerciale / transactionnelle : « quelqu'un peut-il automatiser mes tâches ? » | Page principale pour *automatisation* et *agents IA*. Sections ancrées `#offres`, `#methode`, `#agent`, `#cesite`, `#faq`, `#appel` |
| Pages légales (mentions, confidentialité, cookies) | Routes pas encore créées | Aucune | Aucun enjeu de trafic ; conformité uniquement (voir § 5) |
| Guides et cas d'usage | Futur | Informationnelle (« comment automatiser… ») | Longue traîne : une requête par page, un lien vers l'appel découverte. À planifier après mesure des termes du § 2 |

Une page unique limite le nombre de requêtes ciblées : le SEO durable viendra des futures pages.

## 4. Règles de métadonnées

| Élément | Règle |
|---|---|
| `title` | ≲ 60 caractères, mot-clé principal, marque en tête ou en fin selon le gabarit existant (`Softn.io \| …`) |
| `meta description` | ≲ 155 caractères, ton de la page (« je » / « vous »), bénéfice concret, sans superlatif ni promesse absolue |
| `h1` | **Un seul** par page, hiérarchie h1 → h2 → h3 sans saut |
| Canonical | `alternates.canonical` relatif, résolu via `metadataBase` (`https://softn.io`) ; une page indexée a sa propre URL canonique |
| Open Graph | `type: website`, `url`, `title`, `description`, `locale: fr_FR`, image `opengraph-image.png` avec texte alternatif |
| Langue | `<html lang="fr">` |
| Plan du site | `app/sitemap.ts` : pages indexables uniquement |

## 5. Règles d'indexation

| Page | `robots` meta | `robots.txt` |
|---|---|---|
| `/` | `index, follow` | Autorisée |
| `/preview` | `noindex, nofollow`, sans canonical | **Disallow** |
| Pages légales | **Décision ouverte, à trancher par Mel** | Autorisées (voir ci-dessous) |

### Pages légales : `index, nofollow` ou `noindex` ?

| | `index, nofollow` (suggestion de Mel) | `noindex` |
|---|---|---|
| Apparition dans les résultats | Oui, possible (ex. recherche « softn.io mentions légales ») | Non |
| Effet de `nofollow` | Les liens sortants de la page ne sont pas suivis ; **n'empêche pas** l'indexation | — |
| Intérêt | Pages trouvables, signal de transparence | Aucun contenu de conformité dans l'index |
| Limite | Contenu sans valeur SEO dans l'index | Pages moins trouvables hors du pied de page |

Point de vigilance : `Disallow` dans `robots.txt` **empêche** Google de lire la balise `noindex` ; ne jamais combiner les deux pour une même page. Pour `/preview`, le `Disallow` est voulu (page de développement, aucun lien entrant), la balise `noindex` reste en filet de sécurité.

## 6. Données structurées

- `ProfessionalService` : **marque seule**. Texte proposé dans `docs/content-proposals/jsonld-2026-10-26.md`.
- `FAQPage` : seulement quand la FAQ est **visible sur la page indexée**, avec le texte identique à celui affiché (`locales/fr/faq.ts`). Pas de FAQPage sur l'écran « bientôt en ligne ».
- **Pas de** `Review` ni `AggregateRating` : aucun avis à publier.
- Pas de `founder`, `employee`, adresse, téléphone, e-mail, horaires (décisions Mel du 2026-10-04).
- Un seul bloc JSON-LD par type, rendu côté serveur via un composant dédié.

## 7. Maillage interne

- One-page : navigation par ancres vers les sections ; liens vers les pages légales dans le pied de page.
- Chaque future page (guide, cas d'usage) : lien vers la page d'accueil avec une ancre descriptive (pas « cliquez ici ») et vers `#appel`.
- Pages légales : lien de retour vers l'accueil.
- Pas de lien vers `/preview`.

## 8. Écarts constatés

Écarts entre les métadonnées existantes et ce brief (pas de réécriture proposée ici) :

1. **Héritage depuis `app/layout.tsx`** : le layout définit `canonical: '/'`, `openGraph.url: '/'` et le `title`/`description` d'accueil comme valeurs par défaut. Toute page qui ne les surcharge pas (futures pages légales, futur guide) déclarerait la page d'accueil comme canonique, ce qui contredit la règle « une page indexée a sa propre URL canonique » (§ 4).
2. **`/preview`** : `canonical: null` est correct, mais la page hérite quand même de `openGraph.url: '/'` et de l'OG du layout. Sans effet tant que la page est en `noindex`.
3. **Pages légales** : `locales/fr/metadata.ts` ne porte aucune directive `robots` ; la décision du § 5 est ouverte.
4. **`robots.txt` et `sitemap`** : `app/robots.ts` et `app/sitemap.ts` n'existent pas encore ; le `Disallow` de `/preview` du § 5 n'est donc pas appliqué.
5. **Description du layout** : le `description` par défaut (`home.description`) annonce l'« Échange Spark » et un plan d'action alors que le site en ligne est l'écran « bientôt en ligne » ; la page `/` le surcharge correctement, donc écart sans effet sur `/`.

## 9. Points ouverts pour Mel

- Robots des pages légales (§ 5).
- Validation des termes en hypothèse (§ 2), idéalement après une mesure réelle des volumes.
- Date d'ouverture de la one-page complète, qui déclenche `FAQPage` et la révision des métadonnées d'accueil.
