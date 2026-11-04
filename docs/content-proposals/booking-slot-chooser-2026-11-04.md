# Proposition — Choix du créneau par jour puis heure, dans le chat (`locales/fr/chatbot.ts`)

À valider par Mel. Pour l'issue #123 : la liste de pastilles horaires du chat (trois à cinq créneaux et « Voir plus de créneaux ») laisse la place au sélecteur de la page de gestion : une rangée de jours, puis les heures libres du jour choisi, puis la note de fuseau. Dans le chat, le premier jour libre est présélectionné et un clic sur une heure choisit le créneau ; le récapitulatif reste l'étape de confirmation.

Clés concernées : `chatbot.booking.steps.slot.*` et `chatbot.booking.slots.*`. Les fichiers `locales/fr/chatbot.ts` et `locales/fr/bookingManage.ts` restent indépendants : le chat a ses propres clés, même quand le texte est identique.

Mot-clé principal : sans objet (libellés d'interface, pas de contenu référencé). Aucun prix, aucun chiffre.
Note de ton : libellés courts, « vous » formel, aucune majuscule superflue, pas d'emoji, aucune phrase assemblée par concaténation. Le seul marqueur est `{day}`, rempli au rendu avec le libellé long du jour (« mardi 10 novembre »), jamais collé à un texte par le composant.

## 1. Nouveaux libellés du sélecteur

| Clé | Texte | Statut | Notes |
|---|---|---|---|
| `chatbot.booking.slots.dayLabel` | Jour | new | Libellé visible au-dessus de la rangée de jours. **Repris tel quel** de `reschedule.chooser.dayLabel` (page de gestion). |
| `chatbot.booking.slots.timeLabel` | Heure · {day} | new | Libellé visible au-dessus des heures. `{day}` = libellé long du jour choisi (« mardi 10 novembre »), rempli au rendu. **Repris tel quel** de `reschedule.chooser.timeLabel`. |
| `chatbot.booking.slots.dayGroupLabel` | Jours disponibles | new | Nom accessible du groupe de boutons-jours (`aria-label`, lu par les lecteurs d'écran). |
| `chatbot.booking.slots.timeGroupLabel` | Heures disponibles le {day} | new | Nom accessible du groupe de boutons-heures. `{day}` = même libellé long que ci-dessus (« Heures disponibles le mardi 10 novembre »). |

Choix : **réutiliser le texte de la page de gestion tel quel** pour les libellés visibles, au lieu de l'adapter.
- Même sélecteur, même design, même vocabulaire : une personne qui passe du chat à la page de gestion retrouve les mêmes mots.
- Rien dans le chat ne demande un autre ton : la question posée juste au-dessus (point 4) porte déjà la phrase complète, les libellés restent de simples étiquettes courtes.
- Les clés sont dupliquées dans `chatbot.ts` (pas d'import depuis `bookingManage.ts`), conformément à l'indépendance des deux fichiers.

Choix : des **noms accessibles distincts** des libellés visibles.
- « Jour » et « Heure · mardi 10 novembre » sont corrects à l'écran mais courts et un peu secs à l'écoute ; les noms accessibles précisent qu'il s'agit de choix disponibles.
- Le groupe d'heures annonce le jour choisi avec « le », ce qui se lit naturellement (« Heures disponibles le mardi 10 novembre ») ; le point médian « · » de l'étiquette visible se prononce mal.
- Variante plus économe si vous préférez moins de clés : relier chaque groupe à son libellé visible (`aria-labelledby`) et ne créer ni `dayGroupLabel` ni `timeGroupLabel`. Les lecteurs d'écran diraient alors « Jour » et « Heure · mardi 10 novembre ».

## 2. `chatbot.booking.slots.more`

| Clé | Texte | Statut | Notes |
|---|---|---|---|
| `chatbot.booking.slots.more` | Voir plus de créneaux | **removed** | Plus de pagination : tous les jours ayant des créneaux sont dans la rangée de jours (qui défile), et toutes les heures libres du jour choisi sont affichées. La clé n'a plus d'usage. |

## 3. `chatbot.booking.slots.listLabel`

| Clé | Texte | Statut | Notes |
|---|---|---|---|
| `chatbot.booking.slots.listLabel` | Créneaux disponibles | **removed** | Nommait l'unique liste de pastilles. Il y a désormais deux groupes (jours, heures) : un seul nom ne convient plus. Remplacée par `dayGroupLabel` et `timeGroupLabel` (point 1). |

Variante écartée : conserver `listLabel` en la renommant pour le groupe de jours. Même texte « Créneaux disponibles » inadapté (ce sont des jours) ; mieux vaut une clé qui dit ce qu'elle nomme.

## 4. `chatbot.booking.steps.slot`

| Clé | Texte actuel | Texte proposé | Statut | Notes |
|---|---|---|---|---|
| `chatbot.booking.steps.slot.question` | Parmi ces créneaux, lequel vous convient ? | Quel jour et quelle heure vous conviennent ? | **adapted** | « Parmi ces créneaux » désigne une liste unique qui n'existe plus. La nouvelle phrase annonce le choix en deux temps sans le détailler, reste une question à la forme des autres étapes (« Quel est votre prénom ? »), et reste courte. |
| `chatbot.booking.steps.slot.field` | Créneau | Créneau | **kept** | Libellé du récapitulatif (« Créneau : mardi 10 novembre à 14 h »). Le résultat de la sélection reste un créneau, aucune raison de changer. |

Variante : « Choisissez un jour, puis une heure. » Plus directe, mais passe de la question à l'impératif, ce que le reste de l'échange ne fait pas. Non recommandée.

## 5. Clés conservées sans changement

| Clé | Texte | Statut | Notes |
|---|---|---|---|
| `chatbot.booking.slots.loading` | Je consulte les disponibilités… | kept | Toujours affiché pendant la lecture des disponibilités. |
| `chatbot.booking.slots.timezoneNote` | Les horaires sont indiqués en heure de Paris. | kept | Même texte que `reschedule.chooser.timezoneNote` ; placée sous les heures, comme aujourd'hui. |
| `chatbot.booking.slots.none` | Je ne trouve aucun créneau disponible pour le moment. Vous pouvez écrire via la {contactPageLink}, et votre demande sera lue. | kept | Horizon vide : le sélecteur n'est pas affiché. |
| `chatbot.booking.slots.unavailable` | Je n'arrive pas à consulter les disponibilités pour le moment. Vous pouvez réessayer dans un instant, ou écrire via la {contactPageLink}. | kept | Échec de lecture, avec réessai. |
| `chatbot.booking.error.slotTaken` | Ce créneau n'est plus disponible. Veuillez en choisir un autre, s'il vous plaît. | kept | Le message vaut toujours, quel que soit le mode de choix. |
| `chatbot.booking.error.retry` | Réessayer | kept | Bouton de nouvel essai après un échec de lecture. |

## Récapitulatif des clés

| Clé | Statut |
|---|---|
| `slots.dayLabel`, `slots.timeLabel` | new (texte identique à la page de gestion) |
| `slots.dayGroupLabel`, `slots.timeGroupLabel` | new (nom accessible) |
| `steps.slot.question` | adapted |
| `slots.more`, `slots.listLabel` | removed |
| `steps.slot.field`, `slots.loading`, `slots.timezoneNote`, `slots.none`, `slots.unavailable`, `error.slotTaken`, `error.retry` | kept |

Pour `nextjs-dev` (hors copie) : le libellé long du jour (`{day}`) et les trois éléments du bouton-jour (jour de la semaine, numéro, mois) viennent du formatage de date du composant, pas de `locales/`. Le nom accessible d'un bouton-jour devrait dire le jour en entier (« mardi 10 novembre »), pas la juxtaposition « mar. 10 nov. ».

## Points à trancher

1. Libellés visibles : reprendre « Jour » et « Heure · {day} » de la page de gestion (recommandé) ou les adapter au chat ?
2. Noms accessibles : deux clés dédiées, « Jours disponibles » et « Heures disponibles le {day} » (recommandé), ou relier les groupes aux libellés visibles pour économiser deux clés ?
3. `steps.slot.question` : « Quel jour et quelle heure vous conviennent ? » (recommandé) ou « Choisissez un jour, puis une heure. » ?
4. Suppression de `slots.more` et de `slots.listLabel` : validée ?
5. Annonce après le choix d'un jour (zone `aria-live`) : je ne propose aucune phrase dédiée ; le libellé « Heure · {day} » qui change suffit comme annonce. Souhaitez-vous une phrase explicite (par exemple le nombre d'heures libres) ? Elle demanderait une gestion du pluriel côté composant, ce que le site évite.
