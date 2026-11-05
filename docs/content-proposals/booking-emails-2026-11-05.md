# Proposition — E-mails de réservation envoyés par Softn.io (issue #116, option C)

**À valider par Mel** (révision 2 : décisions de Mel du 2026-11-05 intégrées). Rien n'est intégré dans `locales/` tant que ce document n'est pas validé.

Mot-clé principal : sans objet (e-mails transactionnels, hors SEO).
Note de ton : vouvoiement, « je » (Mel écrit), chaleureux et rassurant, phrases courtes. Aucun émoji, aucune image, aucun suivi, aucun argument commercial. Vocabulaire repris du site : « échange Spark », « 30 minutes », « en visio », « offert ». Le mot « vitrine » n'apparaît nulle part.

Cadre : Google n'envoie plus rien aux invités (`sendUpdates=none`). Softn.io envoie les quatre e-mails via l'API Gmail, depuis l'alias Workspace dédié `meet@softn.io`, avec « Softn.io » comme nom d'expéditeur. `From`, `Reply-To` et l'`ORGANIZER` du fichier `.ics` utilisent tous `meet@softn.io`. Les réponses des invités arrivent dans la boîte de Mel. Les e-mails 1 à 3 portent un fichier d'agenda `.ics`, l'e-mail 4 n'en porte pas.

## 0. Principes communs

- **Texte brut d'abord.** Chaque corps est un texte brut ; la version HTML minimale reprend les mêmes paragraphes (un paragraphe = un `<p>`, un lien = un `<a>`), sans mise en forme supplémentaire.
- **Aucune concaténation.** Chaque e-mail est une chaîne complète avec ses paramètres. Les lignes fixes (date, heure, durée, lien) ne changent que par leur valeur.
- **Aucun pluriel écrit à la main.** La seule quantité variable, `{rescheduleNoticeHours}`, s'écrit « 12 h » : l'abréviation est invariable. La durée arrive déjà formatée dans `{duration}`.
- **Date et heure.** `{date}` et `{time}` sont formatées côté serveur avec `Intl.DateTimeFormat` en `fr-FR`, fuseau `Europe/Paris`. Aucune date n'est écrite à la main dans les textes.
- **Signature**, sur trois lignes, identique dans les quatre e-mails :

  ```text
  Mélanie
  Founder
  Softn.io
  ```

- **Pied de page.** Une ligne qui dit pourquoi la personne reçoit l'e-mail (elle a réservé sur softn.io). Pas de lien de désinscription ni d'adresse postale : e-mails transactionnels, sans aucun contenu commercial.

### Paramètres communs

| Paramètre                  | Contenu                                                                                               | Exemple                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------- |
| `{firstName}`              | Prénom saisi par la personne dans l'assistant.                                                        | « Camille »                |
| `{date}`                   | Date longue en français, jour de la semaine inclus, fuseau de Paris.                                  | « jeudi 12 novembre 2026 » |
| `{time}`                   | Heure de début, fuseau de Paris, format français.                                                     | « 14 h 30 »                |
| `{duration}`               | Durée de l'échange, déjà formatée avec son unité. Vient de `slotMinutes` dans `lib/booking/rules.ts`. | « 30 minutes »             |
| `{meetLink}`               | URL Google Meet de l'événement.                                                                       | `https://meet.google.com/…` |
| `{manageLink}`             | URL signée de la page « Gérer mon rendez-vous » (issue #115). Absente de l'e-mail d'annulation.       | `https://…/rendez-vous/…`  |
| `{rescheduleNoticeHours}`  | Nombre d'heures avant l'appel jusqu'auquel le déplacement reste possible (`rescheduleNoticeHours`).   | « 12 »                     |

Paramètres propres à un e-mail ou au fichier `.ics` : précisés dans chaque section.

## 1. E-mail de confirmation (après la réservation)

Pièce jointe : `invitation.ics` (`METHOD:REQUEST`, `SEQUENCE:0`).
Paramètres utilisés : `{firstName}`, `{date}`, `{time}`, `{duration}`, `{meetLink}`, `{manageLink}`, `{rescheduleNoticeHours}`.

**Objet :** Votre échange Spark est confirmé : {date} à {time}

**Pré-en-tête :** 30 minutes en visio, offertes. Le lien de connexion est dans ce message.

**Corps (texte brut) :**

```text
Bonjour {firstName},

Votre échange Spark est confirmé. Je me réjouis d'en discuter avec vous.

Date : {date}
Heure : {time} (heure de Paris)
Durée : {duration}, en visio
Lien de connexion : {meetLink}

Vous trouverez en pièce jointe l'invitation à ajouter à votre agenda. Si elle n'apparaît pas d'elle-même, ouvrez la pièce jointe et choisissez d'ajouter l'événement.

Un empêchement ? Vous pouvez déplacer ou annuler ce rendez-vous en ligne, jusqu'à {rescheduleNoticeHours} h avant l'appel : {manageLink}

Si vous avez une question avant notre échange, répondez simplement à cet e-mail.

À bientôt,
Mélanie
Founder
Softn.io

—
Vous recevez ce message parce que vous avez réservé un échange Spark sur softn.io.
```

## 2. E-mail de mise à jour (après un déplacement)

Pièce jointe : `invitation.ics` (`METHOD:REQUEST`, `SEQUENCE` incrémenté de 1, même `UID`).
Paramètres utilisés : tous ceux de l'e-mail 1, plus :

| Paramètre         | Contenu                                     | Exemple                    |
| ----------------- | ------------------------------------------- | -------------------------- |
| `{previousDate}`  | Date longue de l'ancien créneau.            | « jeudi 12 novembre 2026 » |
| `{previousTime}`  | Heure de l'ancien créneau, fuseau de Paris. | « 14 h 30 »                |

`{date}` et `{time}` désignent ici le **nouveau** créneau.

**Objet :** Votre échange Spark est déplacé : {date} à {time}

**Pré-en-tête :** Votre nouveau créneau est enregistré. Votre agenda se met à jour avec la pièce jointe.

**Corps (texte brut) :**

```text
Bonjour {firstName},

Votre échange Spark est déplacé. Voici votre nouveau créneau :

Date : {date}
Heure : {time} (heure de Paris)
Durée : {duration}, en visio
Lien de connexion : {meetLink}

Il remplace le créneau initialement prévu le {previousDate} à {previousTime}. Le lien de connexion reste le même.

L'invitation mise à jour est en pièce jointe : en l'ouvrant, elle remplace l'ancien rendez-vous dans votre agenda.

Un nouvel empêchement ? Vous pouvez encore déplacer ou annuler ce rendez-vous en ligne, jusqu'à {rescheduleNoticeHours} h avant l'appel : {manageLink}

À bientôt,
Mélanie
Founder
Softn.io

—
Vous recevez ce message parce que vous avez réservé un échange Spark sur softn.io.
```

## 3. E-mail d'annulation (après une annulation)

Pièce jointe : `invitation.ics` (`METHOD:CANCEL`, `STATUS:CANCELLED`, `SEQUENCE` incrémenté de 1, même `UID`).
Pas de lien de gestion ni de lien Meet : le rendez-vous n'existe plus.
Paramètres utilisés : `{firstName}`, `{date}`, `{time}`, `{bookingLink}`.

| Paramètre       | Contenu                                                                                                                                                              | Exemple                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `{bookingLink}` | URL absolue, construite par le serveur à partir de l'URL du site : la page d'accueil ancrée sur l'assistant, parcours de réservation ouvert (`/?rdv#assistant`). | `https://softn.io/?rdv#assistant` |

`{date}` et `{time}` désignent le créneau annulé.

**Objet :** Votre échange Spark du {date} est annulé

**Pré-en-tête :** L'annulation est enregistrée. Vous pouvez réserver à nouveau quand vous le souhaitez.

**Corps (texte brut) :**

```text
Bonjour {firstName},

Votre échange Spark prévu le {date} à {time} (heure de Paris) est annulé.

La pièce jointe retire ce rendez-vous de votre agenda. Si l'annulation n'apparaît pas d'elle-même, ouvrez la pièce jointe pour la valider.

Si vous changez d'avis, vous pouvez réserver un nouvel échange quand vous le souhaitez : {bookingLink}

Vous pouvez aussi répondre à cet e-mail si vous préférez m'écrire.

Bien cordialement,
Mélanie
Founder
Softn.io

—
Vous receviez ce message parce que vous aviez réservé un échange Spark sur softn.io.
```

## 4. E-mail de rappel (environ 24 heures avant)

Aucune pièce jointe. Envoyé entre 24 h et 23 h 30 avant l'appel.
Paramètres utilisés : `{firstName}`, `{date}`, `{time}`, `{duration}`, `{meetLink}`, `{manageLink}`, `{rescheduleNoticeHours}`.

**Objet :** Rappel : votre échange Spark, {date} à {time}

**Pré-en-tête :** C'est bientôt. Voici le lien de connexion.

**Corps (texte brut) :**

```text
Bonjour {firstName},

Un petit rappel : nous nous retrouvons bientôt pour votre échange Spark.

Date : {date}
Heure : {time} (heure de Paris)
Durée : {duration}, en visio
Lien de connexion : {meetLink}

Un empêchement ? Vous pouvez encore déplacer ce rendez-vous en ligne jusqu'à {rescheduleNoticeHours} h avant l'appel, ou l'annuler : {manageLink}

À très vite,
Mélanie
Founder
Softn.io

—
Vous recevez ce message parce que vous avez réservé un échange Spark sur softn.io.
```

Note de cohérence : l'appel étant réservable avec au moins 24 h de préavis, le déplacement est encore possible à l'envoi du rappel (environ 24 h avant, limite à `{rescheduleNoticeHours}` h). Si Mel réduit un jour le préavis de réservation sous `rescheduleNoticeHours`, la phrase « Vous pouvez encore déplacer » devra être conditionnée.

## 5. Fichier d'agenda (`.ics`) : titre et description

Ces textes sont les mêmes pour les trois fichiers (le `METHOD` change, pas le texte), sauf la description de l'annulation. `ORGANIZER` : `meet@softn.io`.

**Titre de l'événement (`SUMMARY`) :** `Échange Spark — {firstName} {lastName} x Softn.io`

Identique à `booking.event.title` de `locales/fr/chatbot.ts`, pour que la copie Google synchronisée et le fichier décrivent le même événement. Paramètres : `{firstName}`, `{lastName}` (prénom et nom saisis par la personne).

**Description (`DESCRIPTION`) pour la réservation et le déplacement :**

```text
Échange Spark : {duration} en visio, avec Softn.io.

Lien de connexion : {meetLink}

Un empêchement ? Vous pouvez modifier ou annuler ce rendez-vous en ligne : {manageLink}
```

La dernière ligne reprend mot pour mot `bookingManage.calendarEvent.line`, déjà validée.

**Description pour l'annulation (`METHOD:CANCEL`) :**

```text
Cet échange Spark est annulé.
```

Pas de lien : le rendez-vous n'existe plus.

**Lieu (`LOCATION`) :** `{meetLink}` (réservation et déplacement uniquement). Aucun texte à traduire.

## 6. Messages de succès à ajuster dans `locales/`

Les e-mails viennent désormais de Softn.io, pas de Google. Un envoi qui échoue n'annule jamais la réservation (décision de l'issue #116) : les messages ne doivent donc pas affirmer que l'e-mail « vient d'être envoyé », mais annoncer qu'il va arriver.

| Clé                                                                        | Avant                                                                                                                                                                                       | Après                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chatbot.booking.success.message` (`locales/fr/chatbot.ts`)                | Merci {firstName}. Votre échange Spark est confirmé pour le créneau « {slot} ». Vous allez recevoir une invitation par e-mail ou directement dans votre agenda.                              | Merci {firstName}. Votre échange Spark est confirmé pour le créneau « {slot} ». Vous allez recevoir un e-mail de confirmation, avec l'invitation à ajouter à votre agenda. Pensez à vérifier vos courriers indésirables s'il tarde. |
| `chatbot.booking.steps.email.question` (`locales/fr/chatbot.ts`)           | Quelle adresse e-mail pour recevoir l'invitation ?                                                                                                                                          | Quelle adresse e-mail pour recevoir la confirmation et l'invitation ?                                                                                                                                                           |
| `bookingManage.reschedule.success.message` (`locales/fr/bookingManage.ts`) | Votre échange Spark est maintenant fixé au créneau « {slot} ». Une invitation mise à jour vient de vous être envoyée.                                                                       | Votre échange Spark est maintenant fixé au créneau « {slot} ». Vous allez recevoir un e-mail avec l'invitation mise à jour.                                                                                                    |
| `bookingManage.cancel.success.message` (`locales/fr/bookingManage.ts`)     | Votre échange Spark est annulé. Un message de confirmation d'annulation vient de vous être envoyé. Si vous changez d'avis, vous pourrez réserver un nouvel échange quand vous le souhaitez. | Votre échange Spark est annulé. Vous allez recevoir un e-mail de confirmation d'annulation. Si vous changez d'avis, vous pourrez réserver un nouvel échange quand vous le souhaitez.                                           |
| `bookingManage.recap.formatValue` (`locales/fr/bookingManage.ts`)          | 30 min, en visio. Le lien est dans l'invitation.                                                                                                                                            | 30 min, en visio. Le lien est dans l'e-mail de confirmation.                                                                                                                                                                    |
| `bookingManage.states.invalid.message` (`locales/fr/bookingManage.ts`)     | Ce lien ne permet pas d'afficher un rendez-vous. Utilisez le lien de l'invitation que vous avez reçue, ou écrivez-moi via le {contactLink}.                                                 | Ce lien ne permet pas d'afficher un rendez-vous. Utilisez le lien de l'e-mail ou de l'invitation que vous avez reçus, ou écrivez-moi via le {contactLink}.                                                                     |

Inchangés (le mot « invitation » reste juste) : `bookingManage.calendarEvent.line` et `linkLabel`, `bookingManage.cancel.confirm.*`, `bookingManage.states.late.message`.

## 7. Politique de confidentialité (`locales/fr/legal.ts`)

Trois ajustements, tous dans la section de la politique de confidentialité.

**a) Nouveau paragraphe** : clé proposée `privacy.emails.body` (nouvelle section, entre `ai` et `changes`).

> Après une réservation, un déplacement ou une annulation, ainsi qu'environ 24 heures avant l'échange, Softn.io vous envoie un e-mail de service : confirmation, mise à jour, annulation ou rappel. Ces messages sont envoyés avec Gmail (Google Workspace) depuis l'adresse meet@softn.io, et ne servent qu'à organiser l'échange. Les données utilisées sont votre prénom, votre adresse e-mail, le créneau choisi et les liens de connexion et de gestion du rendez-vous. Elles ne servent jamais à de la prospection ni à l'envoi de lettres d'information. Le message comporte un fichier d'agenda (hors rappel), sans suivi d'ouverture ni de clic. Si vous répondez à un de ces messages, votre réponse est lue dans la boîte de réception de Softn.io.

**b) `privacy.purposes.booking`**

- Avant : « Organiser l'échange découverte, envoyer l'invitation, préparer le plan d'action, et permettre à la personne de déplacer ou d'annuler son rendez-vous, le créneau et le statut de la demande étant alors mis à jour. Base légale : consentement de la personne, recueilli avant toute saisie dans l'assistant. »
- Après : « Organiser l'échange découverte, envoyer les e-mails de service liés au rendez-vous (confirmation, mise à jour, annulation et rappel), préparer le plan d'action, et permettre à la personne de déplacer ou d'annuler son rendez-vous, le créneau et le statut de la demande étant alors mis à jour. Base légale : consentement de la personne, recueilli avant toute saisie dans l'assistant. »

**c) `privacy.processors.google`**

- Avant : « Google Calendar : agenda des rendez-vous et envoi de l'invitation. Données hébergées dans l'Union européenne (paramètre de localisation des données de Google Workspace) ; transferts encadrés par des clauses contractuelles types. Lien Google Meet : hébergement et garanties de transfert : [À COMPLÉTER PAR MEL après vérification]. »
- Après : « Google Calendar et Gmail : agenda des rendez-vous et envoi des e-mails de service (confirmation, mise à jour, annulation, rappel). Données hébergées dans l'Union européenne (paramètre de localisation des données de Google Workspace) ; transferts encadrés par des clauses contractuelles types. Lien Google Meet : hébergement et garanties de transfert : [À COMPLÉTER PAR MEL après vérification]. »

**Hors périmètre de ce document** (à signaler à `security-audit` / `chatbot-dev`) : `docs/rgpd/processors.md` doit ajouter Gmail à la ligne Google, avec le champ « données » : prénom, e-mail, créneau, liens. Je n'ai pas vérifié si les données Gmail suivent le même paramètre de localisation que Calendar ; la mention « Union européenne » ci-dessus est reprise de la ligne Calendar et n'est pas confirmée pour Gmail.

## 8. Décisions de Mel (2026-11-05)

1. **Désinscription :** aucun lien de désinscription, e-mails transactionnels.
2. **Expéditeur et réponses :** alias Workspace dédié `meet@softn.io`, nom d'affichage « Softn.io ». `From`, `Reply-To` et `ORGANIZER` du `.ics` utilisent cette adresse. Les invités peuvent répondre ; les réponses arrivent dans la boîte de Mel.
3. **Titre du `.ics` :** conservé, identique à `booking.event.title`.
4. **Lien de nouvelle réservation (e-mail d'annulation) :** `/?rdv#assistant` (`BOOKING_OPEN_QUERY_KEY = 'rdv'`, `SECTION_IDS.agent = 'assistant'` dans `lib/anchors.ts`), en lien absolu construit par le serveur à partir de l'URL du site (`{bookingLink}`).
5. **Signature :** trois lignes, « Mélanie », « Founder », « Softn.io », dans les quatre e-mails.
6. **Phrase de la confirmation :** « Je suis ravie de vous retrouver pour en parler. » remplacée par « Je me réjouis d'en discuter avec vous. » (sans accord de genre).
7. **E-mail de rappel :** conseil de préparation supprimé.
8. **Lien Meet après déplacement :** vérifié (le patch conserve la visioconférence, `lib/google/calendar.test.ts:757`) ; la phrase « Le lien de connexion reste le même » est conservée.
9. **Pied de page :** conservé tel que proposé, sans adresse postale.
