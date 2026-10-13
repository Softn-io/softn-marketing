# Libellés du header (navigation desktop) — proposition

> À valider par Mel

- Date : 2026-10-13 · Tâche : #9 header navigation
- Section : `nav` (`locales/fr/hero.ts`)
- Mot-clé principal de la section : aucun (navigation). Les mots-clés « automatisation » et « agents IA » restent portés par le H1, le sous-titre et les H2. Le `seo-brief.md` n'existe pas encore : aucune donnée de volume, « non mesuré ».
- `title` / `meta description` : sans objet (pas de changement de page).

## Problème

5 liens + logo + bouton thème + CTA débordent sous environ 1289 px. Les libellés actuels font 22 à 28 caractères ; le CTA, 26.

| Clé | Libellé actuel | Caractères |
|---|---|---|
| `offers` | Services pour votre activité | 28 |
| `method` | Un projet suivi pas à pas | 25 |
| `agent` | {assistantName}, l'assistant | 18 + prénom |
| `thisSite` | Les coulisses de ce site | 24 |
| `faq` | Questions fréquentes | 20 |
| `cta` | Réserver mon échange Spark | 26 |

## Recommandation : option (b), libellés courts dédiés au header

Les titres longs restent comme eyebrows ; le header reçoit ses propres libellés courts. Raisons :

1. Un eyebrow et un lien de menu n'ont pas le même rôle. L'eyebrow introduit le H2 en une phrase descriptive ; le lien doit tenir en un coup d'oeil. Contraindre l'un par l'autre appauvrit les deux.
2. Les libellés courts du design v3 fonctionnent mal comme eyebrows : « Ce site » et « L'agent » n'annoncent rien au lecteur.
3. Coût technique faible : un sous-objet `nav.items` (ou `nav.short`) et les `nav.offers` / `nav.method` / `nav.thisSite` actuels restent inchangés pour `offers.ts`, `method.ts`, `thisSite.ts`. Aucune modification des sections.
4. Si Mel préfère l'option (a), « Ce que je fais » et « Ma méthode » fonctionneraient aussi comme eyebrows ; « Ce site » ne conviendrait pas.

Structure suggérée pour `locales/fr/hero.ts` (clés, pas de concaténation) :

```
nav.items.offers
nav.items.method
nav.items.agent      // interpolation {assistantName} conservée si option avec prénom
nav.items.thisSite
nav.items.faq
nav.ctaShort         // header uniquement ; common.cta.book inchangé ailleurs
```

Les `aria-label` / `title` des liens peuvent reprendre le libellé long pour garder le contexte aux lecteurs d'écran.

## Libellés proposés (2 options max)

| Clé | Option A (recommandée) | Car. | Option B | Car. |
|---|---|---|---|---|
| `offers` | Ce que je fais | 14 | Mes services | 12 |
| `method` | Ma façon de travailler | 22 | Ma méthode | 10 |
| `agent` | L'assistant IA | 14 | {assistantName} | prénom seul |
| `thisSite` | Ce site | 7 | Coulisses du site | 17 |
| `faq` | Questions fréquentes | 20 | FAQ | 3 |
| `cta` (header seul) | Réserver mon échange | 20 | Échange Spark offert | 20 |

Largeur totale A : environ 77 caractères de liens contre environ 115 aujourd'hui, soit un gain d'un tiers. Si cela ne suffit pas, passer `method` en « Ma méthode » (-12) et `faq` en « FAQ » (-17) réduit à environ 48.

### Notes par libellé

- **offers** : « Ce que je fais » reste honnête, car l'offre couvre sites, apps, automatisations et IA ; « Mes services » est plus générique. Éviter « Automatisation et IA » en lien : il ne couvre pas les sites et apps.
- **method** : « Ma méthode » est la plus courte et la plus claire ; « Ma façon de travailler » est plus chaleureuse et reprend le design v3 (22 car., à la limite du seuil).
- **agent** : « L'assistant IA » dit ce que c'est sans prénom (déjà donné dans la section) et contient « IA ». Option B (prénom seul) est plus engageante mais opaque pour un nouveau visiteur ; à réserver si le prénom est connu.
- **thisSite** : « Ce site » est très court mais ambigu seul ; « Coulisses du site » garde l'intention du libellé long.
- **faq** : « Questions fréquentes » est déjà à 20 caractères. « FAQ » est un sigle courant et gagne de la place ; à garder en repli si le débordement persiste.
- **cta** : « Spark » est expliqué dans le hero et la section `#appel`. Dans le header, « Réserver mon échange » suffit ; le nom complet reste dans `common.cta.book` partout ailleurs. À valider : le nom « échange Spark » doit-il apparaître dès le header pour la cohérence de marque ?

## Notes SEO

- Les liens d'ancre internes d'une page unique pèsent peu en référencement : ne pas chercher à y placer « automatisation » ou « agents IA » au prix de la lisibilité.
- Le bénéfice SEO vient du H1, des H2 et des eyebrows longs, qui restent inchangés avec l'option (b).
- « L'assistant IA » est le seul libellé court qui porte naturellement un mot-clé voisin (« IA »). Rien de forcé.
- Libellés courts : vérifier que chaque lien garde un nom accessible explicite (pas de « Ce site » seul pour un lecteur d'écran, d'où l'`aria-label` long).

## Ton

Tutoiement exclu ; « je » pour Mel (« Ce que je fais », « Ma méthode »), neutre sinon. Aucun mot banni, aucun chiffre, aucune promesse.

## À décider par Mel

1. Option (b) (recommandée) ou (a) ?
2. Choix entre options A et B par libellé.
3. CTA header raccourci, ou conserver « Réserver mon échange Spark » ?
4. Prénom de l'assistant dans le header ou « L'assistant IA » ?

À valider par Mel
