# Modifier ou annuler un échange Spark — proposition de textes (2026-11-02)

Issue #115. Textes pour la page de gestion d'un rendez-vous, atteinte depuis un lien signé de l'invitation. Clés prévues pour un nouveau fichier `locales/fr/bookingManage.ts`.

- Mot-clé principal : sans objet (page non indexée, `robots: noindex, nofollow`).
- Ton : « vous » de politesse, « je » quand Mel parle, phrases courtes, rassurant, sans emoji, sans ton de sanction.
- Paramètres entre accolades, remplis par le code : `{slot}` (créneau déjà formaté, par exemple « mardi 3 novembre à 14 h 30, heure de Paris »), `{hours}` (délai de report, règle modifiable), `{link}`, `{contactLink}`. Aucune date ni aucun pluriel écrit à la main.
- La page n'affiche jamais le nom du visiteur : aucun paramètre `{firstName}` dans ce fichier.

## 1. Invitation du calendrier

Texte brut, lisible tel quel dans une invitation. Le lien est l'URL signée.

- `calendarEvent.line` : « Un empêchement ? Vous pouvez modifier ou annuler ce rendez-vous en ligne : {link} »
- `calendarEvent.linkLabel` : « Modifier ou annuler mon rendez-vous »

`linkLabel` sert si la description accepte un lien nommé ; sinon seule `line` est utilisée.

## 2. Page

- `meta.title` : « Gérer mon rendez-vous | Softn.io »
- `meta.robots` : « noindex, nofollow »
- `title` : « Votre échange Spark »
- `currentSlot.label` : « Votre rendez-vous actuel »
- `currentSlot.value` : « {slot} »
- `intro` : « Vous pouvez déplacer ce rendez-vous à un autre moment, ou l'annuler. Le déplacement est possible en ligne jusqu'à {hours} h avant l'appel. »

## 3. Déplacer le rendez-vous

- `reschedule.action` : « Choisir un autre créneau »
- `reschedule.chooser.title` : « Choisissez votre nouveau créneau »
- `reschedule.chooser.listLabel` : « Créneaux disponibles »
- `reschedule.chooser.timezoneNote` : « Les horaires sont indiqués en heure de Paris. »
- `reschedule.chooser.more` : « Voir d'autres créneaux »
- `reschedule.loading` : « Je consulte les disponibilités… »
- `reschedule.empty` : « Je ne trouve aucun créneau disponible pour le moment. Vous pouvez conserver votre rendez-vous actuel, ou m'écrire via le {contactLink}. »
- `reschedule.confirm.title` : « Confirmer le nouveau créneau »
- `reschedule.confirm.summary` : « Votre échange Spark passera de « {slot} » à « {newSlot} ». »
- `reschedule.confirm.submit` : « Confirmer ce créneau »
- `reschedule.confirm.back` : « Choisir un autre créneau »
- `reschedule.success.title` : « Rendez-vous déplacé »
- `reschedule.success.message` : « Votre échange Spark est maintenant fixé au créneau « {slot} ». Une invitation mise à jour vient de vous être envoyée. »

Paramètres : dans `reschedule.confirm.summary`, `{slot}` est le créneau actuel et `{newSlot}` le créneau choisi ; dans `reschedule.success.message`, `{slot}` est le nouveau créneau.

## 4. Annuler le rendez-vous

Action en deux étapes : un clic isolé n'annule rien.

- `cancel.action` : « Annuler le rendez-vous »
- `cancel.confirm.question` : « Souhaitez-vous vraiment annuler votre échange Spark prévu le « {slot} » ? »
- `cancel.confirm.submit` : « Oui, annuler le rendez-vous »
- `cancel.confirm.back` : « Non, conserver le rendez-vous »
- `cancel.success.title` : « Rendez-vous annulé »
- `cancel.success.message` : « Votre échange Spark est annulé. Un message de confirmation d'annulation vient de vous être envoyé. Si vous changez d'avis, vous pourrez réserver un nouvel échange quand vous le souhaitez. »
- `cancel.success.bookAgain` : « Réserver un nouvel échange Spark »

Cible de `cancel.success.bookAgain` : `/#assistant` - Flow de prise de rendez-vous ouvert (comme `contact.intro.agentLink.href`).

## 5. États selon la règle

Déplacement possible jusqu'à `{hours}` h avant l'appel ; annulation possible jusqu'au début de l'appel.

- `states.late.title` : « Ce rendez-vous n'est plus modifiable »
- `states.late.message` : « Votre rendez-vous a lieu dans moins de {hours} h : il ne peut plus être déplacé depuis cette page. Pour changer d'horaire, écrivez-moi via le {contactLink}. Vous pouvez aussi l'annuler ici. »
- `states.started.title` : « Ce rendez-vous n'est plus modifiable »
- `states.started.message` : « L'appel a déjà commencé ou le lien a expiré : aucune action n'est possible depuis cette page. Pour toute question, écrivez-moi via le {contactLink}. »
- `states.cancelled.title` : « Rendez-vous déjà annulé »
- `states.cancelled.message` : « Ce rendez-vous a déjà été annulé. Si vous le souhaitez, vous pouvez réserver un nouvel échange Spark. »
- `states.cancelled.bookAgain` : « Réserver un nouvel échange Spark »
- `states.invalid.title` : « Lien non valide »
- `states.invalid.message` : « Ce lien ne permet pas d'afficher un rendez-vous. Utilisez le lien de l'invitation que vous avez reçue, ou écrivez-moi via le {contactLink}. »

## 6. Échecs

- `errors.slotTaken` : « Ce créneau vient d'être réservé. Veuillez en choisir un autre, s'il vous plaît. »
- `errors.unavailable` : « Le service est momentanément indisponible. Votre rendez-vous n'a pas été modifié. Vous pouvez réessayer dans un instant, ou m'écrire via le {contactLink}. »
- `errors.retry` : « Réessayer »
- `errors.rateLimit` : « Trop de tentatives. Veuillez patienter quelques instants avant de réessayer. »

## 7. Renvoi vers le contact

- `contact.sentence` : « Pour toute autre demande, vous pouvez m'écrire via le {contactLink}. »
- `contact.linkLabel` : « formulaire de contact »
- `contact.href` : « /contact » (même cible que `contact.link.href` dans `locales/fr/contact.ts`)

Le libellé est en minuscules car il s'insère dans une phrase ; `contact.link.label` (« Page de contact ») commence par une majuscule.

## 8. Politique de confidentialité

Fichier : `locales/fr/legal.ts`, bloc `privacy.purposes`. Un changement est nécessaire : `purposes.booking` ne couvre aujourd'hui que l'organisation de l'échange, l'invitation et le plan d'action. Il ne dit pas que la personne peut modifier ou annuler, ni que le créneau et le statut de suivi sont mis à jour dans la table des demandes.

Entrée `purposes.booking`.

Avant :

> Organiser l'échange découverte, envoyer l'invitation et préparer le plan d'action. Base légale : consentement de la personne, recueilli avant toute saisie dans l'assistant.

Après :

> Organiser l'échange découverte, envoyer l'invitation, préparer le plan d'action, et permettre à la personne de déplacer ou d'annuler son rendez-vous, le créneau et le statut de la demande étant alors mis à jour. Base légale : consentement de la personne, recueilli avant toute saisie dans l'assistant.

Entrée `collected.booking` : pas de changement obligatoire. Elle liste déjà le créneau choisi ; le statut de suivi est une donnée de gestion, couverte par la finalité ci-dessus. Option si Mel préfère le lister : remplacer « créneau choisi » par « créneau choisi et son statut (confirmé, déplacé, annulé) ».

Les sous-traitants (Baserow, Google Calendar) ne changent pas. La page de gestion n'ajoute aucun cookie ni service tiers.

## Hypothèses

- Le créneau est affiché par le code, avec fuseau « heure de Paris », comme dans le chat.
- Le déplacement conserve la même invitation (mise à jour) et le même lien.
- Une annulation envoie un message d'annulation (Google Calendar), comme le message de succès l'annonce ; si l'envoi n'est pas garanti techniquement, ajuster `cancel.success.message`.
- `{hours}` s'affiche « 12 h » ; pas de forme plurielle à gérer.
- `bookAgain` pointe vers `/#assistant` ; Flow de prise de rendez-vous ouvert. pas de lien de réservation ailleurs.

## Points à décider par Mel

1. Formulation de l'invitation : « Un empêchement ? » te convient-il, ou préfères-tu une phrase plus neutre ?
2. Cas « rendez-vous dans moins de {hours} h » : faut-il garder la mention « Vous pouvez aussi l'annuler ici » ou rester sur le seul renvoi vers le contact ?
3. Politique de confidentialité : valider la nouvelle phrase de `purposes.booking`, et dire si le statut doit aussi figurer dans `collected.booking`.
4. La page dit « je » (Mel) uniquement dans les renvois vers le contact : cela convient-il pour une page transactionnelle ?
5. Durée de conservation des demandes annulées : toujours à décider (voir `retention.lead`).

À valider par Mel
