# Libellés du header (navigation) — proposition, tour 2

> À valider par Mel

- Date : 2026-10-13 · Tâche : #9 header navigation · Remplace `nav-labels-2026-10-13.md` (refusé)
- Clés concernées : `nav.items.*` (libellés dédiés au header) et `nav.itemsAria.*` (noms accessibles longs). Les eyebrows `nav.offers`, `nav.method`, `nav.thisSite` ne changent pas.
- Mot-clé principal : aucun (navigation). « automatisation » et « agents IA » restent portés par le H1 et les H2. Volumes : non mesurés.
- `title` / `meta description` : sans objet.

## Ce que j'ai relu pour ce tour

- `offers.ts` : deux cartes, kickers « 01 — Créer » et « 02 — Automatiser ».
- `method.ts` : agents IA rapides, un humain qui décide ; la voie « Relecture humaine » est déjà un libellé de la boucle.
- `agent.ts` / `hero.ts` : l'assistant porte un prénom ({assistantName}) ; le hero dit « Une question ? {assistantName}, l'assistant virtuel, vous répond ».
- `thisSite.ts` : le site a été construit avec des agents IA, étape par étape.
- `faq.ts` : titre « Questions fréquentes ».

## Faiblesses du tour 1 corrigées

1. **Libellés génériques.** « Ce que je fais » pourrait figurer sur n'importe quel site de freelance. Il ne dit ni ce que vous créez ni ce que vous automatisez.
2. **Voix incohérente.** Cinq libellés, quatre constructions : « Ce que je fais » (relative), « Ma façon de travailler » (possessif), « L'assistant IA » (nom), « Ce site » (démonstratif), « Questions fréquentes » (nom). Rien ne les relie.
3. **« Ce site » opaque.** On ne sait pas pourquoi cliquer, et le lien semble parler du site lui-même (mentions légales ?). La promesse de la section (« construit avec des agents IA ») est absente.
4. **« L'assistant IA » ne dit pas à quoi il sert** et ignore le prénom, alors que le hero et la section le mettent en avant.
5. **« Ma façon de travailler » : 22 caractères pour un message flou**, sans le différenciateur de la méthode (relecture humaine).
6. **Budget de largeur non traité.** Tour 1 : 77 caractères de liens, plus un CTA de 26 caractères conservé en entier désormais. Chaque proposition ci-dessous donne son total.

## Contrainte de largeur (estimation, à mesurer par `nextjs-dev`)

Hypothèse de calcul, non mesurée : environ 7,5 px par caractère à 14-15 px, 20 px d'écart entre liens, logo et bouton thème d'environ 160 px, CTA complet (26 caractères) d'environ 230 px, marges de 48 px.

- À 1024 px : le total des liens devrait rester autour de 60 caractères ou moins.
- À 768 px (md) : environ 30 caractères au plus, ce qu'aucune proposition ne tient avec 5 liens. Même la direction 3 (39) déborde selon cette estimation.

Conclusion : quelle que soit la direction, le menu inline ne tiendra pas à md avec le CTA complet. Je recommande de basculer sur le drawer sous `lg` (1024 px), ou de masquer le CTA header tant que les liens sont inline à ce gabarit. Décision d'implémentation pour `nextjs-dev` et Mel, pas une question de texte. Le drawer accepte les mêmes chaînes.

## Direction 1 — Noms concrets, portés par le contenu de la page

Principe : chaque libellé reprend un mot déjà présent dans la section visée, donc le lien annonce exactement ce qu'on y trouve.

| Clé | Libellé | Car. | Nom accessible (`aria-label`) | Origine |
|---|---|---|---|---|
| `items.offers` | Créer et automatiser | 20 | Créer et automatiser : mes services pour votre activité | kickers « Créer » / « Automatiser » |
| `items.method` | Relecture humaine | 17 | Relecture humaine : ma méthode, étape par étape | voie « Relecture humaine » de la boucle |
| `items.agent` | Une question ? | 14 | Une question ? Posez-la à {assistantName}, l'assistant virtuel | `hero.agentPrompt` |
| `items.thisSite` | Fait avec l'IA | 14 | Fait avec l'IA : comment ce site a été construit, étape par étape | titre de `thisSite` |
| `items.faq` | FAQ | 3 | FAQ : questions fréquentes | titre de `faq` |

Total : **68 caractères** (tour 1 : 77).

Points forts : aucun libellé vague ; le visiteur sait ce qu'il trouve ; cohérent avec le contenu existant ; aucune promesse nouvelle.
Points faibles : plus long que la direction 3 ; « Relecture humaine » est un différenciateur, pas un mot de menu habituel (un visiteur pressé cherchera « Méthode »).

## Direction 2 — Voix de Mel à la première personne

Principe : le menu est la voix de Mel, comme le reste du site. Le prénom de l'assistant est utilisé pour qu'on ne le confonde pas avec Mel (transparence : l'assistant n'est jamais « je »).

| Clé | Libellé | Car. | Nom accessible (`aria-label`) |
|---|---|---|---|
| `items.offers` | Je crée, j'automatise | 21 | Je crée, j'automatise : mes services pour votre activité |
| `items.method` | Ma méthode | 10 | Ma méthode : un projet suivi pas à pas, relu par un humain |
| `items.agent` | Demandez à {assistantName} | 11 + prénom | Demandez à {assistantName} : poser une question à l'assistant virtuel |
| `items.thisSite` | Comment j'ai fait ce site | 25 | Comment j'ai fait ce site : sa construction avec des agents IA, étape par étape |
| `items.faq` | Vos questions | 13 | Vos questions : questions fréquentes |

Total : **80 caractères + prénom** (tour 1 : 77).

Points forts : voix unique et chaleureuse ; chaque libellé a une personne ; « Demandez à X » est une action claire.
Points faibles : le plus long, donc le plus difficile à loger ; « Je crée, j'automatise » est un peu slogan ; « Vos questions » et « Demandez à X » se ressemblent côte à côte ; dépend du prénom, qui n'est pas encore choisi. Repli plus court pour `thisSite` : « Mes coulisses » (13 car.).

## Direction 3 — Mots courts, standards de navigation

Principe : les mots que n'importe quel visiteur attend dans un menu ; les `aria-label` portent tout le sens.

| Clé | Libellé | Car. | Nom accessible (`aria-label`) |
|---|---|---|---|
| `items.offers` | Services | 8 | Services : créer et automatiser |
| `items.method` | Méthode | 7 | Méthode : un projet suivi pas à pas |
| `items.agent` | Assistant IA | 12 | Assistant IA : poser une question à {assistantName} |
| `items.thisSite` | Coulisses | 9 | Coulisses : comment ce site a été construit |
| `items.faq` | FAQ | 3 | FAQ : questions fréquentes |

Total : **39 caractères**.

Points forts : tient partout, lisible instantanément, aucun risque.
Points faibles : reste générique (le défaut n° 1 du tour 1 persiste) ; « Coulisses » seul est incompréhensible hors contexte ; « Assistant IA » est le seul libellé à deux mots, car « Assistant » seul se lirait comme une personne.

## Mon choix : direction 1

1. C'est la seule qui corrige les cinq défauts de fond du tour 1, sans les contourner par la longueur : chaque libellé est tiré de la page elle-même.
2. Elle renforce le message pragmatique : « Créer et automatiser » dit la tâche, « Relecture humaine » dit la garantie de méthode, « Fait avec l'IA » dit la preuve.
3. Elle laisse la voix « je » aux textes de page, où Mel s'adresse au lecteur, plutôt que de la forcer dans un menu.
4. Son coût est la largeur (68). En cas de contrainte dure, repli par libellé vers la direction 3 : `method` → « Méthode » (-10), `offers` → « Services » (-12), ce qui ramène à 46.

Mélange possible : direction 1 pour `offers`, `agent`, `thisSite`, direction 3 pour `method` et `faq`.

## Structure suggérée pour `locales/fr/hero.ts`

```
nav.items.offers | method | agent | thisSite | faq     // libellés visibles
nav.itemsAria.offers | method | agent | thisSite | faq // noms accessibles longs
```

- `aria-label` : chaque nom accessible commence par le texte visible (critère WCAG « étiquette dans le nom »).
- `agent` utilise l'interpolation `{assistantName}` côté `nav.itemsAria`, jamais de concaténation de phrases.
- Le CTA header reste `nav.cta` = `common.cta.book`.

## Notes SEO

- Dans une page unique, les ancres internes pèsent peu : aucun mot-clé forcé. « IA » apparaît naturellement dans « Fait avec l'IA » (direction 1) et « Assistant IA » (direction 3).
- Le bénéfice SEO reste porté par le H1 et les H2 ; le menu n'y touche pas.

## Ton et garde-fous

- Vouvoiement respecté (« Posez-la », « Demandez à »). Aucun mot banni, aucun chiffre, aucune promesse, aucun superlatif.
- Aucune affirmation nouvelle : chaque libellé renvoie à un texte déjà présent dans `locales/fr/`.

## À décider par Mel

1. Direction 1, 2, 3, ou mélange par libellé ?
2. Seuil d'affichage du menu inline : `lg` (1024 px) ou `xl`, et drawer en dessous ? Aucun jeu de libellés ne tient à 768 px avec le CTA complet.
3. Prénom de l'assistant : nécessaire à la direction 2, optionnel ailleurs (seulement dans l'`aria-label`).
4. « Fait avec l'IA » te convient-il pour présenter la section « Ce site » ?

À valider par Mel
