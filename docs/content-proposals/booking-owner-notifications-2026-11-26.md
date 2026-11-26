# Proposition — E-mails de notification interne des réservations (issue #168)

**Validé par Mel le 2026-11-26.** Ses décisions sont consignées au §5. L'intégration dans `locales/` peut commencer.

Mot-clé principal : sans objet (e-mails internes, hors SEO).
Note de ton : interne, factuel, court, lisible d'un coup d'œil (lignes « libellé : valeur »). C'est Mel qui s'écrit à elle-même via le site : aucun vouvoiement d'un invité, pas de formule d'appel ni de politesse, pas de signature « Mélanie / Founder / Softn.io », aucun émoji. Le mot « vitrine » n'apparaît nulle part.

Cadre : à chaque réservation, déplacement ou annulation d'un échange Spark, Softn.io envoie un e-mail à la propriétaire du Workspace (Mel), par le même chemin Gmail et depuis le même alias d'expéditeur que les e-mails invités. Mel est la seule lectrice. Aucune pièce jointe `.ics`, aucun lien de gestion pour l'invité.

## 0. Principes communs

- **Texte brut d'abord**, comme les e-mails invités : un corps = une chaîne complète, aucune concaténation à l'envoi. Les lignes fixes ne changent que par leur valeur.
- **Lignes facultatives = clés séparées.** Chaque ligne dont la valeur peut manquer (téléphone, structure, fonction, motif d'annulation, lien Baserow) a sa propre clé, qui contient la ligne **entière** avec son libellé. Dans le corps, la ligne occupe un paramètre à part sur sa propre ligne (`{phoneLine}`, etc.). Le code remplit le paramètre avec la ligne formatée, ou **supprime toute la ligne** (retour à la ligne compris) si la valeur est absente. Jamais de libellé sans valeur, jamais de découpe à l'intérieur d'une phrase.
- **Aucun pluriel écrit à la main.** La durée arrive déjà formatée dans `{duration}` (`bookingEmails.duration`, ex. « 30 minutes »).
- **Date et heure** : `{date}` et `{time}` formatées côté serveur, `fr-FR`, fuseau `Europe/Paris`, comme dans `locales/fr/bookingEmails.ts`. Le libellé « heure de Paris » est conservé, car Mel peut lire ces e-mails en déplacement.
- **Pas de signature, pas de pied de page.** Une seule ligne finale, fixe, indique l'origine du message (utile pour un filtre ou une étiquette Gmail) : « Notification automatique du site softn.io. »
- **Pré-en-tête : inutile.** Pour un e-mail interne, l'objet porte déjà le type d'événement, le nom et le créneau ; l'aperçu du client de messagerie affichera directement la première ligne du corps, qui est utile. Je ne propose donc aucune clé `preheader` (à confirmer : si le code en attend une pour rester homogène avec `bookingEmails`, il suffit d'en répéter l'objet).
- **Objets** : type d'événement en premier (repérable en liste), puis nom de l'invité, puis créneau. Chaque type a un verbe distinct : « Nouvel échange Spark », « Échange Spark déplacé », « Échange Spark annulé ».
- **Clés proposées** : un nouvel objet `bookingOwnerEmails` dans un nouveau fichier `locales/fr/bookingOwnerEmails.ts` (ou une section distincte de `bookingEmails.ts`, à l'appréciation de `chatbot-dev`), pour ne pas mélanger l'interne et le texte invité.

### Paramètres communs

| Paramètre       | Contenu                                                                                              | Exemple                       |
| --------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------- |
| `{guestName}`   | Prénom et nom complets saisis par l'invité, dans cet ordre.                                          | « Camille Martin »            |
| `{guestEmail}`  | Adresse e-mail saisie par l'invité.                                                                  | `camille@exemple.fr`          |
| `{date}`        | Date longue en français, jour de la semaine inclus, fuseau de Paris.                                 | « jeudi 12 novembre 2026 »    |
| `{time}`        | Heure de début, fuseau de Paris, format français.                                                    | « 14 h 30 »                   |
| `{duration}`    | Durée déjà formatée avec son unité (`slotMinutes` via `bookingEmails.duration`).                     | « 30 minutes »                |
| `{meetLink}`    | URL Google Meet de l'événement.                                                                      | `https://meet.google.com/…`   |
| `{baserowLink}` | URL de la ligne du prospect dans Baserow. Présente seulement si configurée ; sinon la ligne saute.  | `https://baserow.io/…`        |

## 1. Nouvelle réservation

Paramètres utilisés : `{guestName}`, `{guestEmail}`, `{phoneLine}`, `{structureLine}`, `{roleLine}`, `{need}`, `{date}`, `{time}`, `{duration}`, `{meetLink}`, `{baserowLine}`.

Paramètres propres à cet e-mail :

| Paramètre         | Contenu                                                                                                        | Exemple                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `{phoneLine}`     | Ligne entière issue de `phoneLine` (ci-dessous), ou ligne supprimée si aucun téléphone n'a été saisi.          | « Téléphone : 06 12 34 56 78 »             |
| `{structureLine}` | Ligne entière issue de `structureLine`, ou ligne supprimée si le type de structure n'a pas été saisi.          | « Structure : Entreprise individuelle »    |
| `{roleLine}`      | Ligne entière issue de `roleLine`, ou ligne supprimée si la fonction n'a pas été saisie.                       | « Fonction : Gérante »                     |
| `{need}`          | Besoin tel que l'invité l'a formulé, sans modification. Texte libre, peut être long : il reste la dernière donnée avant le lien Baserow. | « Trier mes demandes entrantes… » |
| `{baserowLine}`   | Ligne entière issue de `baserowLine`, ou ligne supprimée si aucun lien Baserow n'est configuré.                | « Fiche Baserow : https://… »              |

**Objet :** Nouvel échange Spark : {guestName}, {date} à {time}

**Pré-en-tête :** aucun (voir §0).

**Clés des lignes facultatives :**

| Clé             | Valeur                               |
| --------------- | ------------------------------------ |
| `phoneLine`     | Téléphone : {phone}                  |
| `structureLine` | Structure : {structure}              |
| `roleLine`      | Fonction : {role}                    |
| `baserowLine`   | Fiche Baserow : {baserowLink}        |

Paramètres de ces clés : `{phone}`, `{structure}`, `{role}` (valeurs saisies par l'invité, telles quelles) et `{baserowLink}`.

**Corps (texte brut) :**

```text
Nouvel échange Spark réservé.

Invité : {guestName}
E-mail : {guestEmail}
{phoneLine}
{structureLine}
{roleLine}

Date : {date}
Heure : {time} (heure de Paris)
Durée : {duration}, en visio
Lien Meet : {meetLink}

Besoin exprimé :
{need}

{baserowLine}

Notification automatique du site softn.io.
```

Règle de suppression : une ligne facultative absente disparaît entièrement, et le bloc ne laisse jamais de ligne vide en trop (le code retire aussi le saut de ligne). Si `{baserowLine}` est absente, la ligne vide qui la précède saute avec elle.

## 2. Déplacement

Paramètres utilisés : `{guestName}`, `{guestEmail}`, `{previousDate}`, `{previousTime}`, `{date}`, `{time}`, `{duration}`, `{meetLink}`, `{baserowLine}`.

`{previousDate}` et `{previousTime}` désignent l'ancien créneau ; `{date}` et `{time}` le **nouveau**, comme dans `bookingEmails.update`.

**Objet :** Échange Spark déplacé : {guestName}, {date} à {time}

**Pré-en-tête :** aucun (voir §0).

La clé `baserowLine` est la même que pour la réservation (`Fiche Baserow : {baserowLink}`) : une seule clé partagée par les trois e-mails.

**Corps (texte brut) :**

```text
Échange Spark déplacé.

Invité : {guestName}
E-mail : {guestEmail}

Ancien créneau : {previousDate} à {previousTime} (heure de Paris)
Nouveau créneau : {date} à {time} (heure de Paris)
Durée : {duration}, en visio
Lien Meet : {meetLink}

{baserowLine}

Notification automatique du site softn.io.
```

Le lien Meet reste identique après un déplacement (vérifié dans la proposition précédente, `lib/google/calendar.test.ts:757`) ; il est rappelé ici pour avoir le lien sous la main dans le même message.

## 3. Annulation

Paramètres utilisés : `{guestName}`, `{guestEmail}`, `{date}`, `{time}`, `{reasonLine}`, `{baserowLine}`.

`{date}` et `{time}` désignent le créneau **annulé**.

| Paramètre      | Contenu                                                                                                                                                                                 | Exemple                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `{reasonLine}` | Ligne entière issue de `reasonLine`, ou ligne supprimée si l'invité n'a choisi aucun motif (le motif est facultatif).                                                                  | « Motif : Report de projet » |
| `{reasonLabel}`| Libellé français du motif, **repris tel quel** de `bookingManage` (`cancel.reason.options.*` dans `locales/fr/bookingManage.ts`) : voir tableau ci-dessous. Paramètre de la clé `reasonLine`. | « Report de projet »        |

Libellés existants, à réutiliser sans modification (codes de `BOOKING_CANCEL_REASONS`, `schemas/bookingManageLimits.ts`) :

| Code                | Libellé français   |
| ------------------- | ------------------ |
| `prevented`         | Empêchement        |
| `no-longer-needed`  | Report de projet   |
| `found-alternative` | Solution trouvée   |
| `other`             | Autre              |

**Objet :** Échange Spark annulé : {guestName}, {date} à {time}

**Pré-en-tête :** aucun (voir §0).

**Clé de la ligne facultative :**

| Clé          | Valeur                  |
| ------------ | ----------------------- |
| `reasonLine` | Motif : {reasonLabel}   |

**Corps (texte brut) :**

```text
Échange Spark annulé.

Invité : {guestName}
E-mail : {guestEmail}

Créneau annulé : {date} à {time} (heure de Paris)
{reasonLine}

{baserowLine}

Notification automatique du site softn.io.
```

Pas de lien Meet : l'événement n'existe plus. Pas de durée : le créneau annulé suffit.

## 4. Vérification RGPD

Sources lues : `docs/rgpd/processors.md` et `locales/fr/legal.ts`.

**Constat.** Gmail (Google Workspace) est déjà un sous-traitant déclaré : DPA signé, hébergement UE, clauses contractuelles types, ligne « Mentioned in privacy policy : Yes ». Le mécanisme « notification à Softn.io par e-mail » existe déjà pour le formulaire de contact : `processors.md` l'inscrit (« notification to the owner and automatic reply to the sender ») et `privacy.emails.body` le dit (« notification à l'éditeur »). Une notification interne de réservation n'ajoute ni destinataire (Mel, déjà responsable du traitement et destinataire du prospect dans Baserow), ni sous-traitant, ni finalité (organiser l'échange, finalité déjà déclarée dans `privacy.purposes.booking`), ni transfert.

**Décision : aucune modification obligatoire de la politique de confidentialité, aucune mention de plus pour les invités sur la base légale ou les destinataires.** Un message qui reste dans la boîte Softn.io, à l'intérieur du même Workspace, n'est pas une communication à un tiers.

**Deux points d'attention, non bloquants, à trancher par Mel :**

1. **Exactitude de la liste des données.** `privacy.emails.body` énumère les données utilisées par les e-mails de service : « le prénom, l'adresse e-mail, le créneau choisi et les liens de connexion et de gestion du rendez-vous ». L'e-mail interne contient aussi le nom, le besoin, et, quand ils sont saisis, le téléphone, la structure, la fonction et le motif d'annulation. Tout cela est déjà collecté et déjà listé ailleurs dans la politique (`privacy.collected.booking`), mais la phrase de la section « E-mails de service » devient incomplète. Une phrase ajoutée à la fin de `privacy.emails.body` (clé existante, section existante) la rend exacte :

   > Chaque réservation, déplacement ou annulation donne aussi lieu à une notification interne, envoyée à Softn.io avec les informations saisies lors de la réservation (nom, adresse e-mail, besoin, et, le cas échéant, téléphone, structure, fonction et motif d'annulation). Cette notification reste dans la boîte de réception de Softn.io.

   **Recommandation : l'ajouter.** Elle coûte une phrase et évite qu'une lectrice vigilante trouve un écart entre la politique et la pratique. Place : fin de `privacy.emails.body`, avant ou après la phrase sur les messages du formulaire de contact.

2. **Durée de conservation des copies dans la boîte Gmail.** Ces notifications recopient des données du prospect dans une boîte e-mail, qui n'est pas soumise à la purge de 365 jours prévue pour la ligne Baserow (« Lead without follow-up : 365 days », décidée dans `processors.md`). La politique promet cette durée (`privacy.retention.lead`). Sans règle de purge de la boîte (par exemple une étiquette Gmail avec suppression automatique après 365 jours), l'e-mail interne contredirait cette promesse. C'est une décision d'exploitation (filtre Gmail ou règle de rétention Workspace), pas un texte à changer ; je la signale à Mel.

**Hors périmètre de ce document** (à signaler à `security-audit`) : `docs/rgpd/processors.md`, ligne Google Gmail, colonnes « Data concerned » et « Loaded when » : ajouter l'e-mail interne et ses données (nom, besoin, téléphone, structure, fonction, motif d'annulation) ; la colonne « Role » doit mentionner la notification interne de réservation.

**À faire par le développeur (décision du 2026-11-26) :** mettre à jour `docs/rgpd/processors.md`, ligne Google Gmail (colonnes « Role », « Data concerned » et « Loaded when »), pour la notification interne de réservation, dans la même PR que l'intégration du texte.

## 5. Décisions de Mel (2026-11-26)

1. **Pré-en-tête** : aucun, approuvé (§0).
2. **Ordre des lignes** : invité, créneau, besoin, puis lien Baserow, approuvé.
3. **Phrase RGPD** du §4, point 1 : approuvée. Elle s'ajoute à la fin de `privacy.emails.body`, avec la formulation exacte proposée.
4. **Purge de la boîte** du §4, point 2 : Mel crée elle-même une étiquette Gmail avec suppression automatique après 365 jours, hors de cette PR. Aucun changement de texte.
5. **Ligne finale « Notification automatique du site softn.io. »** : conservée.
