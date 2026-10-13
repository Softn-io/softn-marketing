# Libellés de navigation du header, tour 3 (Offres et Méthode)

À valider par Mel.

- Date : 2026-10-13
- Tâche : #9 header navigation
- Périmètre : uniquement les deux libellés encore ouverts, `nav.offers` (section `#offers`) et `nav.method` (section `#method`).
- Mot-clé principal de la section : non applicable à un libellé de navigation (voir la note SEO en fin de document).
- Ne pas répéter (déjà proposés, non retenus). Offres : « Ce que je fais », « Mes services », « Services », « Créer et automatiser », « Services pour votre activité ». Méthode : « Ma façon de travailler », « Ma méthode », « Méthode », « Relecture humaine », « Un projet suivi pas à pas ».

## Décisions déjà prises (rappel)

| Clé | Libellé | Caractères |
|---|---|---|
| `nav.agent` | « Demandez à {assistantName} » | 11 + longueur du prénom |
| `nav.thisSite` | « En coulisses » | 13 |
| `nav.faq` | « FAQ » | 3 |

Registre commun : conversationnel, humain, verbes simples, pas de jargon, vouvoiement implicite (« Demandez ») ou « je » de Mel.

## Ce que disent vraiment les sections

- **Offres** : deux cartes, « 01 — Créer » (site, web app, IA intégrée) et « 02 — Automatiser » (tâches répétitives, workflows, agents IA). Le ton interne est « je vous aide à… », pour indépendants, TPE/PME, petites équipes.
- **Méthode** : cinq étapes (Cadrage, Découpage, Relecture, Livraison, Prise en main) et une boucle « les agents produisent, un humain relit et décide ». Titre de section : « Des agents IA rapides et rigoureux. Un humain qui décide. »
- **Point de vigilance** : « En coulisses » couvre déjà « comment ce site est fabriqué ». Le libellé Méthode doit rester clairement du côté « comment se passe un projet avec moi », sinon les deux entrées se doublonnent dans le header.

## Offres (`nav.offers`, `#offers`)

| # | Libellé | Car. | Justification |
|---|---|---|---|
| O1 | « Ce que je propose » | 17 | Voix de Mel à la première personne, englobe les deux offres. Proche de « Ce que je fais » (écarté) : le verbe change, la forme reste. À assumer ou éviter. |
| O2 | « Pour votre projet » | 17 | Part du lecteur, pas de Mel. Couvre site, app et automatisation sans les nommer. Un peu générique seul, mais l'ancre est évidente dans le contexte. |
| O3 | « Comment je vous aide » | 20 | Le plus chaleureux et le plus fidèle au texte des cartes (« je vous aide à… »). Légèrement au-dessus du budget. |
| O4 | « Deux façons d'avancer » | 21 | Reprend le `srTitle` (« deux façons de travailler ensemble »). Annonce la structure en deux cartes. Au-dessus du budget. |
| O5 | « Mes offres » | 10 | Le plus court. Sens proche de « Mes services » (écarté), donc probablement redondant pour Mel. |
| O6 | « Site ou automatisation » | 21 | Nomme les deux offres avec le mot-clé « automatisation ». Le plus concret, mais plus catalogue et moins dans le registre de « En coulisses ». |

## Méthode (`nav.method`, `#method`)

| # | Libellé | Car. | Justification |
|---|---|---|---|
| M1 | « Comment ça se passe » | 19 | Répond à la question que le lecteur se pose avant de réserver. Conversationnel, rassurant. À côté de « En coulisses », la nuance « pour moi » vs « derrière le site » tient, mais c'est le plus proche. |
| M2 | « Un humain décide » | 16 | Reprend la 2e ligne du titre de section. Dit le différenciateur (IA rapide, humain aux commandes) en trois mots. Un peu slogan : s'appuie sur le contexte de la section pour être compris. |
| M3 | « Gardez la main » | 14 | Impératif, comme « Demandez à… ». Rassure sur le contrôle (relecture, validation, livraisons fréquentes). Moins explicite sur le contenu. |
| M4 | « En cinq étapes » | 14 | Factuel : la section compte bien cinq étapes. Promet de la clarté et de la simplicité. Ne dit pas le rôle de l'humain. |
| M5 | « Du cadrage au suivi » | 19 | Raconte le parcours du premier échange à la prise en main. « Cadrage » est un peu professionnel, mais il est utilisé tel quel dans la section. |

## Jeux complets (les 5 libellés ensemble)

### Top pick

| Position | Libellé | Car. |
|---|---|---|
| 1. Offres | « Ce que je propose » (O1) | 17 |
| 2. Méthode | « Comment ça se passe » (M1) | 19 |
| 3. Assistant | « Demandez à {assistantName} » | 11 + prénom |
| 4. Ce site | « En coulisses » | 13 |
| 5. FAQ | « FAQ » | 3 |

Lecture d'ensemble : quoi (« Ce que je propose »), comment (« Comment ça se passe »), puis poser une question, voir les coulisses, la FAQ. Rythme parlé, tout en mots courts. Les deux premiers font un couple « quoi / comment » naturel.

Réserve à trancher : « Ce que je propose » est proche de « Ce que je fais », déjà écarté. Si Mel l'a refusé pour la tournure « Ce que je… » et non pour le verbe, passer à « Pour votre projet » (O2) : le jeu fonctionne aussi, avec une entrée tournée vers le lecteur.

### Runner-up

| Position | Libellé | Car. |
|---|---|---|
| 1. Offres | « Comment je vous aide » (O3) | 20 |
| 2. Méthode | « Un humain décide » (M2) | 16 |
| 3. Assistant | « Demandez à {assistantName} » | 11 + prénom |
| 4. Ce site | « En coulisses » | 13 |
| 5. FAQ | « FAQ » | 3 |

Plus chaleureux et plus différenciant, mais « Comment je vous aide » dépasse le budget de deux caractères et « Un humain décide » ne se comprend pleinement qu'en contexte. À préférer si le header a de la place (>= lg), moins sûr sur un burger étroit.

## Libellés d'accessibilité (`aria-label`)

Chaque `aria-label` commence par le texte visible (WCAG 2.5.3, Label in Name). La partie ajoutée précise la destination.

| Clé | Texte visible | `aria-label` proposé |
|---|---|---|
| `nav.offers` | « Ce que je propose » | « Ce que je propose : créer votre site ou automatiser vos tâches » |
| `nav.method` | « Comment ça se passe » | « Comment ça se passe : les étapes d'un projet, relu par un humain » |
| `nav.offers` (runner-up) | « Comment je vous aide » | « Comment je vous aide : créer votre site ou automatiser vos tâches » |
| `nav.method` (runner-up) | « Un humain décide » | « Un humain décide : les étapes d'un projet, relu par un humain » |
| `nav.offers` (O2) | « Pour votre projet » | « Pour votre projet : créer votre site ou automatiser vos tâches » |

Variantes pour les autres candidats, si retenus :

- O4 : « Deux façons d'avancer : créer ou automatiser »
- M3 : « Gardez la main : comment se déroule un projet, étape par étape »
- M4 : « En cinq étapes : le déroulement d'un projet »
- M5 : « Du cadrage au suivi : le déroulement d'un projet »

## Notes

- **SEO** : un libellé de navigation pèse peu. Le mot-clé « automatisation » est déjà porté par le H1, les cartes et la méta. Seul O6 l'inclurait dans le header ; je ne le recommande pas pour cette seule raison, au détriment du registre.
- **Interdits respectés** : pas de « vitrine », pas de vocabulaire hype, aucun chiffre inventé (« cinq étapes » correspond aux cinq entrées de `method.steps`).
- **Intégration** : `locales/fr/offers.ts` et `method.ts` utilisent `nav.offers` / `nav.method` comme `eyebrow`. Changer le libellé change donc aussi l'eyebrow de la section. À vérifier : « Ce que je propose » et « Comment ça se passe » fonctionnent comme eyebrow, mais « Un humain décide » ou « Gardez la main » y feraient doublon avec le titre. Si besoin, `nav.*` et `eyebrow` pourraient être séparés (décision pour `nextjs-dev`).

## Points à trancher par Mel

1. Offres : O1 « Ce que je propose » (risque de ressemblance avec « Ce que je fais ») ou O2 « Pour votre projet » ?
2. Méthode : M1 « Comment ça se passe » (clair, un peu proche de « En coulisses ») ou M2 « Un humain décide » (plus différenciant, plus slogan) ?
3. Accepter un dépassement de budget (20 à 21 caractères) pour la version runner-up, ou rester sous 19 ?
4. Séparer ou non le libellé de nav et l'eyebrow de section (voir note d'intégration).
