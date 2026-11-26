# Proposition — Transcription Gemini : information écrite dans les e-mails de réservation (`locales/fr/bookingEmails.ts` et `locales/fr/legal.ts`), issue #154

À valider par Mel. Aujourd'hui, la personne n'est informée de la transcription qu'à l'oral, au début de l'échange : aucune trace écrite. Décision de Mel : une courte information dans les e-mails de confirmation, de mise à jour et de rappel (pas dans l'e-mail d'annulation, puisqu'il n'y a plus d'échange), et la politique de confidentialité (`purposes.call`) qui le dit.

Mot-clé principal : sans objet (e-mails de service et page légale). Note de ton : « vous » pour la personne, « je » pour Mel, chaleureux et sobre, pas de jargon juridique (pas de « base légale », « opposition » ni « RGPD » dans l'e-mail), pas d'emoji, aucune promesse absolue.

Faits repris tels quels de `legal.ts` (`data.call`, `purposes.call`, `processors.meet`), rien d'ajouté : transcription et résumé produits par Gemini (Google Workspace) ; ils ne servent qu'à préparer le plan d'action ; l'échange n'est pas enregistré (ni vidéo, ni son) ; la personne peut demander que la transcription soit désactivée.

Convention : le paragraphe est un seul bloc de texte (une clé par e-mail, ou une clé partagée), sans variable ni concaténation. E-mail en texte brut : pas de lien Markdown.

## 1. Paragraphe à ajouter

### Version recommandée (2 phrases)

> Pour préparer votre plan d'action, Gemini (Google Workspace) peut transcrire et résumer notre échange : il n'est enregistré ni en vidéo ni en son, et la transcription ne sert qu'à cela. Si vous préférez la désactiver, répondez simplement à cet e-mail ou dites-le-moi au début de l'appel.

Raison : la finalité vient en premier (c'est ce qui rassure), la limite (pas d'enregistrement, usage unique) tient dans la même phrase, et le geste à faire (répondre ou le dire à Mel) est concret et sans formalité. « Peut » reflète le fait que la transcription est désactivable à la demande.

### Variante (3 phrases, avec renvoi vers le site)

> Pour préparer votre plan d'action, je peux faire transcrire et résumer notre échange par Gemini (Google Workspace) ; il n'est ni enregistré en vidéo ni en son. Si vous préférez désactiver la transcription, répondez simplement à cet e-mail ou dites-le-moi au début de l'appel. Le détail est dans la politique de confidentialité, sur softn.io.

Cette variante compte une phrase de plus et un renvoi vers le site : plus complète, mais l'e-mail s'allonge et le renvoi ressemble à une mention légale. À retenir seulement si Mel veut un pointeur écrit vers la politique. Sinon, la version recommandée suffit, la politique étant déjà accessible depuis softn.io.

## 2. Même texte pour les trois e-mails ?

**Oui, le texte recommandé convient tel quel aux trois e-mails** (confirmation, mise à jour, rappel). Il ne dit ni « demain », ni une date : « notre échange » reste juste quel que soit le délai d'envoi (le rappel part environ 24 heures avant, pas à heure fixe), et « cet e-mail » reste exact dans chacun. Une variante « notre échange de demain » n'apporterait rien et deviendrait fausse si le délai d'envoi change. Une seule clé partagée suffit donc (par exemple `bookingEmails.transcriptNotice`), insérée dans chaque corps.

Texte exact par e-mail :

| E-mail       | Texte                                                                                                                                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Confirmation | Pour préparer votre plan d'action, Gemini (Google Workspace) peut transcrire et résumer notre échange : il n'est enregistré ni en vidéo ni en son, et la transcription ne sert qu'à cela. Si vous préférez la désactiver, répondez simplement à cet e-mail ou dites-le-moi au début de l'appel. |
| Mise à jour  | Identique.                                                                                                                                                                                                                                                                                 |
| Rappel       | Identique.                                                                                                                                                                                                                                                                                 |
| Annulation   | Aucun ajout (il n'y a plus d'échange).                                                                                                                                                                                                                                                     |

## 3. Emplacement dans chaque corps

Principe : le bloc des détails du rendez-vous (Date, Heure, Durée, Lien de connexion) reste en tête, juste après la première phrase. Le paragraphe vient après les informations pratiques (agenda, empêchement) et avant la formule de politesse. Il est séparé des autres par une ligne vide, comme tous les paragraphes.

**Confirmation** : après le paragraphe

> Un empêchement ? Vous pouvez déplacer ou annuler ce rendez-vous en ligne, jusqu'à {rescheduleNoticeHours} h avant l'appel : {manageLink}

et avant

> Si vous avez une question avant notre échange, répondez simplement à cet e-mail.

(La phrase finale sur les questions reste en dernier : elle prolonge naturellement l'invitation à répondre.)

**Mise à jour** : après le paragraphe

> Un nouvel empêchement ? Vous pouvez encore déplacer ou annuler ce rendez-vous en ligne, jusqu'à {rescheduleNoticeHours} h avant l'appel : {manageLink}

et avant « À bientôt, ».

**Rappel** : après le paragraphe

> Un empêchement ? Vous pouvez encore déplacer ce rendez-vous en ligne jusqu'à {rescheduleNoticeHours} h avant l'appel, ou l'annuler : {manageLink}

et avant « À très vite, ».

**Annulation** : aucun changement.

Les `preheader`, `subject` et le pied de message ne changent pas. La partie HTML reprend les paragraphes du corps : aucun traitement particulier à prévoir.

## 4. Politique de confidentialité : `purposes.call` (avant / après)

| Version | Texte                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Avant   | Préparer le plan d'action remis à la suite de l'échange découverte : la transcription et le résumé ne servent qu'à cela. Base légale : intérêt légitime (préparer le plan d'action demandé par la personne). La personne est informée au début de l'échange et peut demander que la transcription soit désactivée : elle exerce alors son droit d'opposition.                                                                                                                                                                                                                                                                                                      |
| Après   | Préparer le plan d'action remis à la suite de l'échange découverte : la transcription et le résumé ne servent qu'à cela. Base légale : intérêt légitime (préparer le plan d'action demandé par la personne). La personne en est informée par écrit dans les e-mails de réservation (confirmation, mise à jour et rappel), puis au début de l'échange. Elle peut demander que la transcription soit désactivée, en répondant à l'un de ces e-mails ou à l'oral : elle exerce alors son droit d'opposition. |

Seule la fin change : l'information est maintenant écrite (e-mails) **et** orale (début de l'appel), et les deux façons de s'opposer sont nommées, comme dans l'e-mail. `data.call`, `processors.meet` et `retention.call` restent inchangés : ils sont déjà cohérents avec les faits (transcription et résumé par Gemini, pas d'enregistrement, usage limité au plan d'action).

## 5. Contrôle par rapport à `docs/brand-voice.md`

- « Vous » formel partout : oui (« votre plan d'action », « Si vous préférez », « répondez »). Première personne de Mel : « dites-le-moi » (version recommandée), « je peux » (variante).
- Chaleureux et expert, phrases courtes, un message par paragraphe : oui, 2 phrases, un seul sujet.
- IA pragmatique, tâche concrète d'abord : la finalité (préparer le plan d'action) passe avant l'outil (Gemini), qui est nommé parce qu'il aide à expliquer ce que fait Mel (règle « tools are named when they help explain »).
- Mots interdits ou à éviter : aucun « vitrine », « révolutionnaire », « disruptif », « game changer », « magique ». Pas d'emoji. Pas de jargon juridique dans les e-mails (« base légale » et « droit d'opposition » restent dans la politique).
- Aucun fait inventé : chaque élément vient de `legal.ts` (Gemini de Google Workspace, transcription et résumé, usage limité au plan d'action, pas d'enregistrement vidéo ni son, désactivation sur demande). Aucun chiffre, aucune promesse absolue, aucune durée de conservation citée dans l'e-mail.
- Un point à confirmer par Mel : « répondre à cet e-mail » suppose que les réponses arrivent bien dans sa boîte (déjà annoncé dans l'e-mail de confirmation : « répondez simplement à cet e-mail »).

## 6. Décisions pour Mel

1. Version recommandée ou variante avec renvoi vers softn.io ?
2. Une clé partagée (`bookingEmails.transcriptNotice`) ou un paragraphe par e-mail ? Recommandation : une clé partagée, puisque le texte est identique.
3. Valider la nouvelle fin de `purposes.call`, qui ajoute « en répondant à l'un de ces e-mails ou à l'oral » : cette précision est facultative ; sans elle, la phrase reste exacte.
