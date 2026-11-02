# Proposition — Réservation dans le chatbot et textes légaux associés (issues #17 et #18)

**À valider par Mel.** Rien n'est intégré dans `locales/` tant que ce document n'est pas validé.

Mot-clé principal : sans objet (textes fonctionnels et juridiques, pas de page indexée). `title` et `meta description` : sans objet.
Note de ton : vouvoiement, ton chaleureux et rassurant, phrases courtes, un message par phrase. L'assistant parle à la première personne (« je »). Aucun émoji, aucun chiffre ni garantie inventés, aucun prix.

## Hypothèses de départ

- Ordre du parcours : consentement, besoin, créneau, identité (prénom, nom, e-mail, téléphone facultatif, structure facultative, fonction facultative), récapitulatif, confirmation.
- Appel de 30 minutes sur Google Meet ; Google envoie l'invitation, par e-mail ou directement dans l'agenda du visiteur selon ses réglages Google ; heures affichées en heure de Paris.
- Les données personnelles ne vont jamais au modèle d'IA. Le texte libre du « besoin » est saisi après le consentement ; l'invite de la zone de saisie (`input.privacyNote`) reste inchangée.
- Aucune promesse de report, d'annulation ni de rappel (issues #115 et #116).
- Paramètres existants conservés : `{assistantName}`, `{firstName}`, `{slot}`, `{current}`, `{total}`, `{contactPageLink}`. Aucun nouveau paramètre n'est introduit, sauf `{timezone}` si le dev préfère ne pas écrire « heure de Paris » en dur (non retenu ici).

## 1. Introduction et étapes (`chatbot.booking`)

| Clé | Texte actuel | Texte proposé | Raison |
| --- | --- | --- | --- |
| `chatbot.booking.intro` | « Volontiers. L'échange Spark est offert et sans engagement. Je vais vous poser quelques questions rapides pour préparer la réservation. » | « Volontiers. L'échange Spark dure 30 minutes, il est offert et sans engagement. Je vous demande d'abord votre besoin et je vous propose des créneaux, puis quelques informations pour confirmer. » *(texte validé par Mel le 01/11/2026)* | Annonce la durée réelle, l'ordre (besoin, créneau, identité) et retire la mention du format de l'appel, portée par l'invitation. |
| `chatbot.booking.steps.need.question` | « En une phrase, quel est votre besoin ? » | « En une phrase, quel est votre besoin ? » *(texte validé par Mel le 01/11/2026)* | Question d'ouverture du parcours, sans la mention « pour commencer » : le besoin est déjà la première question posée. Typographie française appliquée dans `locales/fr/chatbot.ts` : espace insécable avant « ? », « ! », « : », « ; » et à l'intérieur des guillemets « ». |
| `chatbot.booking.steps.need.field` | « Besoin » | Inchangé. | — |
| `chatbot.booking.steps.need.example` | « Automatiser mes devis » | Inchangé. | — |
| `chatbot.booking.steps.slot.question` | « Quel créneau vous convient ? » | « Parmi ces créneaux, lequel vous convient ? » | Le créneau suit le besoin et s'appuie sur une liste réelle affichée juste en dessous. |
| `chatbot.booking.steps.slot.field` | « Créneau » | Inchangé. | — |
| `chatbot.booking.identityIntro` (nouvelle clé) | — | « Parfait. Il me manque quelques informations pour confirmer votre rendez-vous. » | Marque la transition vers les questions d'identité, désormais placées après le créneau. Affichée une seule fois, avant la question sur le prénom. |
| `chatbot.booking.steps.firstName.question` | « Quel est votre prénom ? » | Inchangé. | La transition est portée par `identityIntro`. |
| `chatbot.booking.steps.lastName.question` | « Et votre nom ? » | Inchangé. | — |
| `chatbot.booking.steps.email.question` | « Quelle adresse e-mail pour l'invitation ? » | « Quelle adresse e-mail pour recevoir l'invitation ? » | Précise que l'invitation arrive à cette adresse. |
| `chatbot.booking.steps.phone.question` | « Un numéro de téléphone, au cas où l'appel serait interrompu ? (facultatif) » | Inchangé. | Toujours juste avec un appel Google Meet. |
| `chatbot.booking.steps.structure.question`, `role.question` | Voir le fichier. | Inchangés. | — |
| `chatbot.booking.step` | « Question {current} sur {total} » | Inchangé. | L'ordre des étapes change, pas le format du compteur. Le compteur doit suivre le nouvel ordre : besoin (1), créneau (2), prénom, nom, e-mail, téléphone, structure, fonction. |

**Effet du réordonnancement sur `steps.need` et `steps.slot`** : le besoin et le créneau passent en premières questions, avant tout champ d'identité. Le dev doit réordonner l'enchaînement et le compteur ; le récapitulatif doit lister les champs dans le même ordre.

## 2. Étape du créneau (nouvelles clés)

Structure proposée : `chatbot.booking.slots`.

| Clé | Texte proposé | Raison |
| --- | --- | --- |
| `chatbot.booking.slots.loading` | « Je consulte les disponibilités… » | État de chargement pendant l'appel au calendrier ; même style que `thinking.message`. |
| `chatbot.booking.slots.listLabel` | « Créneaux disponibles » | Libellé accessible (`aria-label`) de la liste de 3 à 5 puces. |
| `chatbot.booking.slots.more` | « Voir plus de créneaux » *(décision de Mel du 01/11/2026 ; la proposition disait « Voir d'autres créneaux »)* | Bouton pour afficher d'autres disponibilités. |
| `chatbot.booking.slots.timezoneNote` | « Les horaires sont indiqués en heure de Paris. » | Évite toute ambiguïté de fuseau horaire. |
| `chatbot.booking.slots.none` | « Je ne trouve aucun créneau disponible pour le moment. Vous pouvez écrire via la {contactPageLink}, et votre demande sera lue. » | Cas sans disponibilité, avec le lien de contact (`contactPageLinkLabel` : « page de contact »). Ne promet aucun délai de réponse. |
| `chatbot.booking.slots.unavailable` | « Je n'arrive pas à consulter les disponibilités pour le moment. Vous pouvez réessayer dans un instant, ou écrire via la {contactPageLink}. » | Cas d'échec du service de calendrier. Reprend la tournure de `error.llm` ; le bouton « Réessayer » existe déjà (`error.retry`). |

## 3. Consentement (`chatbot.consent`)

| Clé | Texte actuel | Texte proposé | Raison |
| --- | --- | --- | --- |
### Revue de Mel du 01/11/2026 (parcours de réservation)

Textes fournis par Mel elle-même lors de sa relecture ; ils remplacent les propositions ci-dessous.

| Clé | Texte validé | Raison |
| --- | --- | --- |
| `chatbot.consent.message` (phrase finale) | « En cliquant sur le bouton « Continuer », vous acceptez que vos informations soient utilisées pour organiser l'échange. » | Phrase ajoutée à la fin du message : l'acceptation est explicite au moment du clic. |
| `chatbot.consent.accept` | « Continuer » | Libellé du bouton d'acceptation. Le consentement reste un clic explicite, jamais pré-coché, et l'horodatage est posé par le serveur à la réception. |
| `chatbot.consent.link.inlineLabel` | « politique de confidentialité » | Les mots déjà présents dans la phrase deviennent le lien vers la politique ; le lien autonome sous le message disparaît. Aucune formulation ajoutée. |
| `chatbot.booking.recap.editPrompt` | « Quelle réponse souhaitez-vous modifier ? » | **Validée par Mel le 01/11/2026** : question posée par le lien unique « Modifier une réponse », qui remplace les liens par ligne du récapitulatif. |
| `chatbot.booking.slots.more` | « Voir plus de créneaux » | **Décision de Mel le 01/11/2026** : le libellé devient « Voir plus de créneaux » (il était « Voir d'autres créneaux ») et le contrôle rejoint la rangée des créneaux au lieu d'être sur sa propre ligne. |

| `chatbot.consent.message` | « Avant de poursuivre : pour réserver, j'ai besoin de votre prénom, de votre nom, de votre adresse e-mail et de quelques informations sur votre projet. Ces données sont transmises à Softn.io pour organiser l'échange et vous envoyer l'invitation. Vous pouvez demander leur suppression à tout moment. Le détail figure dans la politique de confidentialité. » | « Avant de poursuivre : pour réserver, j'ai besoin de votre prénom, de votre nom, de votre adresse e-mail et de quelques informations sur votre besoin. Elles servent à organiser l'échange. Elles ne sont jamais envoyées à l'assistant IA. Vous pouvez retirer votre accord ou demander leur suppression à tout moment via la politique de confidentialité. » *(texte validé par Mel le 01/11/2026)* | Dit ce qui est collecté et pourquoi, précise que l'IA ne reçoit pas ces données, et rappelle le retrait du consentement dès le recueil, comme le recommande la CNIL pour une information en couches. Les destinataires restent décrits dans la politique de confidentialité, liée juste en dessous. |
| `chatbot.consent.link` | Libellé et lien `/politique-de-confidentialite` | Inchangé. | Lien conservé. |
| `chatbot.consent.accept` | « J'accepte que mes informations soient utilisées pour organiser l'échange » | Inchangé. | Cohérent avec la finalité annoncée. |
| `chatbot.consent.decline`, `declined`, `accepted` | Voir le fichier. | Inchangés. | — |

## 4. Succès (`chatbot.booking.success`)

| Clé | Texte actuel | Texte proposé | Raison |
| --- | --- | --- | --- |
| `chatbot.booking.success.title` | « Demande enregistrée » | « Rendez-vous confirmé » | Le rendez-vous est désormais créé dans le calendrier, pas seulement une demande. |
| `chatbot.booking.success.message` | « Merci {firstName}. Votre demande pour le créneau « {slot} » est enregistrée. Vous recevrez une invitation à l'adresse indiquée. » | « Merci {firstName}. Votre échange Spark est confirmé pour le créneau « {slot} ». Vous allez recevoir une invitation par e-mail ou directement dans votre agenda. » *(texte validé par Mel le 01/11/2026)* | La phrase finale annonce les deux canaux : Google envoie l'invitation, et un invité peut recevoir l'événement dans son agenda sans e-mail. Paramètres `{firstName}` et `{slot}` conservés. Aucune promesse de rappel ou de report. |
| `chatbot.booking.success.restart` | « Recommencer » | Inchangé. | — |

## 5. Erreur de réservation (`chatbot.error.booking`)

| Clé | Texte actuel | Texte proposé | Raison |
| --- | --- | --- | --- |
| `chatbot.error.booking` | « La réservation n'a pas abouti et aucune donnée n'a été conservée. Vous pouvez réessayer, ou utiliser le formulaire de contact : {contactPageLink}. [À CONFIRMER PAR chatbot-dev : vrai seulement si aucune écriture Airtable n'a eu lieu.] » | « La réservation n'a pas abouti : aucun rendez-vous n'a été créé et aucune donnée n'a été conservée. Vous pouvez réessayer, ou écrire via la {contactPageLink}. » | Marqueur retiré. Vrai pour le comportement décrit : si la réservation dans le calendrier échoue, rien n'est enregistré. « Écrire via la {contactPageLink} » suit la convention de `contactPageLinkLabel`. |

**À signaler à `chatbot-dev`** : cette phrase n'est juste que si l'écriture Baserow n'a lieu qu'après la réussite de la réservation du calendrier. Dans le cas inverse (calendrier réussi, enregistrement Baserow en échec), le rendez-vous existe : un message distinct serait nécessaire. Je ne le rédige pas sans que le comportement soit défini.

## 6. Récapitulatif et créneau déjà pris

| Clé | Décision | Proposition | Raison |
| --- | --- | --- | --- |
| `chatbot.booking.recap.title` | À modifier | « Récapitulatif avant confirmation » (actuel : « Récapitulatif avant envoi ») | Rien n'est « envoyé » à Softn.io : la confirmation crée le rendez-vous. |
| `chatbot.booking.recap.confirm` | À modifier | « Confirmer le rendez-vous » (actuel : « Confirmer et envoyer ») | Même raison. |
| `chatbot.booking.recap.edit` | Conservé | « Modifier une réponse » | Toujours juste. |
| `chatbot.booking.cancel` | Conservé | « Annuler la prise de rendez-vous » | Concerne le parcours en cours, pas l'annulation d'un rendez-vous existant : aucune promesse de l'issue #115. |
| `chatbot.booking.cancelled` | Conservé | « La prise de rendez-vous est annulée. Aucune donnée n'a été envoyée. » | Vrai tant que l'annulation a lieu avant la confirmation. |
| `chatbot.error.slotTaken` | Conservé | « Ce créneau n'est plus disponible. Veuillez en choisir un autre, s'il vous plaît. » | Adapté tel quel à la liste de puces : le visiteur revient au choix du créneau. |

## 7. Textes légaux (`locales/fr/legal.ts`)

Faits repris uniquement de `docs/rgpd/processors.md`. Là où le registre ne tranche pas, le marqueur « [À COMPLÉTER PAR MEL…] » est conservé.

| Clé | Texte actuel | Texte proposé | Raison |
| --- | --- | --- | --- |
| `privacy.processors.airtable` | « Airtable : enregistrement des demandes de rendez-vous. Hébergement et garanties de transfert : [À COMPLÉTER PAR MEL après vérification]. » | **Clé supprimée**, remplacée par la clé `baserow` ci-dessous. | Airtable n'est plus utilisé. |
| `privacy.processors.fillout` | « Fillout : réservation du créneau. Hébergement et garanties de transfert : [À COMPLÉTER PAR MEL après vérification]. » | **Clé supprimée.** | Fillout est abandonné. |
| `privacy.processors.baserow` (nouvelle clé) | — | « Baserow : enregistrement des demandes de rendez-vous. Service hébergé en Allemagne (Union européenne), par une société établie aux Pays-Bas. Aucun transfert hors de l'Union européenne. » | Registre : Baserow Cloud, Allemagne (UE), société néerlandaise, « None needed (EU processor, EU hosting) ». |
| `privacy.processors.google` | « Google Calendar : agenda des rendez-vous, via Fillout. Hébergement et garanties de transfert : [À COMPLÉTER PAR MEL après vérification]. » | « Google Calendar : agenda des rendez-vous et envoi de l'invitation. Données hébergées dans l'Union européenne (paramètre de localisation des données de Google Workspace) ; transferts encadrés par des clauses contractuelles types. Lien Google Meet : hébergement et garanties de transfert : [À COMPLÉTER PAR MEL après vérification]. » | Registre : Google Calendar, hébergement UE, clauses contractuelles types. Le registre ne traite pas Google Meet : marqueur conservé pour ce point. |
| `privacy.processors.vercel`, `umami`, `intro` | Voir le fichier. | Hors périmètre de cette demande, inchangés. | Le registre permettrait de les compléter (Vercel : fonctions à Paris, Data Privacy Framework ; Umami : autogéré à Paris) : à traiter dans une autre demande si Mel le souhaite. |
| `cookies.thirdParty.body` | « La réservation d'un créneau repose sur un service tiers (Fillout, avec Google Calendar), chargé uniquement après consentement, au moment de la réservation. En cas de refus, ce service n'est pas chargé et la réservation ne peut pas être finalisée. » | « La réservation d'un échange se fait directement dans l'assistant : aucun service tiers n'est chargé dans votre navigateur pour cela. Les informations transitent par le serveur du site, et les prestataires concernés sont listés dans la politique de confidentialité. » | La réservation ne charge plus aucun tiers côté navigateur. Le texte ne dit rien des cookies de l'invitation reçue par e-mail, qui ne relève pas du site. |
| `cookieBanner.body` (hors liste, repéré en passant) | « Ce site mesure son audience uniquement avec votre accord, afin de s'améliorer. La réservation d'un échange fait aussi appel à un service tiers. Aucun cookie non nécessaire n'est déposé avant votre consentement. » | « Ce site mesure son audience uniquement avec votre accord, afin de s'améliorer. Aucun cookie non nécessaire n'est déposé avant votre consentement. » | La phrase sur le service tiers de réservation devient fausse. Entrée ajoutée hors de la liste demandée : à valider séparément. |

## 8. Invitation au calendrier (validée par Mel le 01/11/2026)

Le texte de l'événement créé dans Google Calendar n'était pas couvert par la proposition initiale. Mel l'a validé dans sa réponse du 01/11/2026.

| Clé | Texte validé | Raison |
| --- | --- | --- |
| `chatbot.booking.event.title` | « Échange Spark — {firstName} {lastName} x Softn.io » | Titre lu par Mel dans son agenda et par le visiteur dans l'invitation : le nom du visiteur, puis Softn.io. |
| `chatbot.booking.event.line` | « {label} : {value} » | Forme d'une ligne de description, le libellé venant des noms de champs du parcours. |
| `chatbot.booking.event` (description) | Une ligne par réponse, dans l'ordre : Besoin, Structure, Fonction, Téléphone, E-mail. Aucune ligne pour une réponse facultative laissée vide, aucune ligne de consentement. | La description garde les réponses si l'enregistrement Baserow échoue. Le consentement n'y figure pas : il est écrit dans les propriétés privées de l'événement (`softnConsentAt`) et dans la ligne Baserow. |

## Points pour Mel

1. **Défaut d'ordre en cas d'échec Baserow** : voir §5, décision à prendre avec `chatbot-dev` (calendrier d'abord, puis Baserow, ou l'inverse).
2. **Durées de conservation** : le registre indique 365 jours (« Decided : Yes ») pour une demande sans suite ; `legal.ts` garde encore « [À COMPLÉTER PAR MEL : durée à décider] ». Je n'y touche pas ici, hors périmètre.
3. **Registre périmé** : `docs/rgpd/processors.md` mentionne encore Fillout/Zite et « Google Calendar (via Fillout) » ; il est tenu par `security-audit`, je n'y touche pas.
4. **Google Meet** : absent du registre, donc marqueur conservé dans `privacy.processors.google`.
5. **`cookieBanner.body`** : entrée supplémentaire (§7), à valider.
