/**
 * Contact emails copy, sent by Softn.io through the Gmail API.
 *
 * Parameters in braces (`{firstName}`, `{lastName}`, `{email}`, `{subjectLabel}`, `{message}`,
 * `{receivedAt}`, `{agentLink}`, `{privacyLink}`, `{signature}`) are filled at send time. Each body
 * is one complete string, footer included, so nothing is ever concatenated at send time;
 * `{receivedAt}` arrives already formatted in Europe/Paris, and `{subjectLabel}` is the label of the
 * subject the visitor picked, read from `contact.form.subject.options`.
 *
 * `{agentLink}` and `{privacyLink}` are rendered apart in the two alternatives: the plain-text part
 * prints the link label followed by the raw address in brackets, while the HTML part turns the raw
 * address into an anchor labelled by `agentLinkLabel` / `privacyLinkLabel`. `{signature}` is filled
 * with `bookingEmails.signature`, so the block has one source and the HTML part can style and link
 * it, exactly like the booking emails.
 *
 * The notification is read by Mel, not by a visitor: it stays factual, carries no closing formula,
 * and its `dataRequestNotice` is prepended when the visitor picked the personal-data request
 * subject. Neither email promises a delay in hours or days.
 */
export const contactEmails = {
  notification: {
    subject: 'Nouveau message : {subjectLabel} — {firstName} {lastName}',
    preheader: 'Un message est arrivé par le formulaire de contact.',
    /** First line of the body when the subject is the personal-data request. */
    dataRequestNotice:
      'Demande relative aux données personnelles : à traiter selon la procédure prévue dans la politique de confidentialité.',
    body: `Un message est arrivé par le formulaire de contact de softn.io.

Nom : {firstName} {lastName}
Adresse e-mail : {email}
Objet : {subjectLabel}
Reçu le : {receivedAt}

Message :

{message}

—
Répondre à cet e-mail écrit directement à l'expéditeur.`,
  },
  autoReply: {
    /** Display name of the sender address, as the visitor reads it in their mail client. */
    senderName: 'Softn.io',
    subject: 'Votre message à Softn.io a bien été reçu',
    preheader: "J'étudie votre demande et reviens vers vous dans les plus brefs délais.",
    /** Words the booking link shows in the HTML part; the plain-text part prints the address. */
    agentLinkLabel: 'Réserver un échange Spark',
    /** Words the privacy-policy link shows in the HTML part; the plain-text part prints the address. */
    privacyLinkLabel: 'politique de confidentialité',
    /** Words the site link of the footer shows in the HTML part. */
    siteLinkLabel: 'softn.io',
    /** Words the contact-page link of the footer shows in the HTML part. */
    contactLinkLabel: 'softn.io',
    body: `Bonjour {firstName},

Votre message est bien arrivé. J'étudie votre demande avec attention et je reviens vers vous dans les plus brefs délais.

Pour mémoire, voici ce que vous m'avez envoyé.

Objet : {subjectLabel}

{message}

Si vous préférez en parler de vive voix, vous pouvez réserver un échange Spark, offert et en visio, via l'assistant virtuel de Softn.io : {agentLink}

Vous pouvez aussi répondre à cet e-mail si vous souhaitez compléter votre message.

À bientôt,

{signature}

—
Vous recevez ce message parce que vous avez écrit à Softn.io par le formulaire de contact de {siteLink}. Vos informations servent uniquement à répondre à votre message.
Pour exercer un droit sur vos données personnelles (accès, rectification, suppression…), vous pouvez envoyer une demande via le formulaire de contact de {contactLink} : le détail figure dans la {privacyLink}.`,
  },
} as const

export type ContactEmails = typeof contactEmails
