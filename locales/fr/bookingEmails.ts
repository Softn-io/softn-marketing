/**
 * Booking emails copy, sent by Softn.io through the Gmail API.
 *
 * Parameters in braces (`{firstName}`, `{date}`, `{time}`, `{duration}`, `{meetLink}`,
 * `{manageLink}`, `{bookingLink}`, `{rescheduleNoticeHours}`, `{previousDate}`, `{previousTime}`,
 * `{manageLine}`, `{minutes}`) are filled at send time. Each body is one complete string, signature
 * and footer included, so nothing is ever concatenated at send time; `{date}` and `{time}` arrive
 * already formatted in Europe/Paris, and `{duration}` is built from the call length in
 * `lib/booking/rules.ts` through {@link bookingEmails.duration}. The `signature` copy is the same
 * three lines the bodies close on, kept apart for the HTML part, which greys that block and links
 * the studio line.
 *
 * `preheader` is the preview text a mail client shows next to the subject. It is part of the copy
 * validated with Mel, kept beside each email; the HTML alternative itself carries the paragraphs
 * only, as the validated proposal asks. The cancellation email adds one label of its own
 * (`bookingLinkLabel`): its HTML part renders the rebooking address behind those words, exactly like
 * the manage link of the other emails, while every plain-text part keeps the raw URL.
 *
 * The reminder is the fourth email: it has no calendar file and is sent by the scheduled job, not
 * by this application's booking routes. Its copy lives here so that job only has to wire it.
 */
export const bookingEmails = {
  /** Template of `{duration}`, filled with the call length of the booking rules. */
  duration: '{minutes} minutes',
  /**
   * Signature of the four emails, on three lines, the studio name last.
   *
   * Each body below carries it in full — a body is one complete string — and this copy is what the
   * HTML part reads to style that block and to link the studio line to the site: the text part
   * keeps the three plain lines.
   */
  signature: `Mélanie
Founder
Softn.io`,
  confirmation: {
    subject: 'Votre échange Spark est confirmé : {date} à {time}',
    preheader: '{duration} en visio, offertes. Le lien de connexion est dans ce message.',
    body: `Bonjour {firstName},

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
Vous recevez ce message parce que vous avez réservé un échange Spark sur softn.io.`,
  },
  update: {
    subject: 'Votre échange Spark est déplacé : {date} à {time}',
    preheader: 'Votre nouveau créneau est enregistré. Votre agenda se met à jour avec la pièce jointe.',
    body: `Bonjour {firstName},

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
Vous recevez ce message parce que vous avez réservé un échange Spark sur softn.io.`,
  },
  cancellation: {
    subject: 'Votre échange Spark du {date} est annulé',
    preheader: "L'annulation est enregistrée. Vous pouvez réserver à nouveau quand vous le souhaitez.",
    /**
     * Words the rebooking link of the cancellation email shows in its HTML part.
     *
     * The plain-text part prints the raw `{bookingLink}` address, as it does for every link; the
     * HTML part renders it behind these words, exactly like the manage link of the other emails.
     */
    bookingLinkLabel: 'Réserver un nouvel échange',
    body: `Bonjour {firstName},

Votre échange Spark prévu le {date} à {time} (heure de Paris) est annulé.

La pièce jointe retire ce rendez-vous de votre agenda. Si l'annulation n'apparaît pas d'elle-même, ouvrez la pièce jointe pour la valider.

Si vous changez d'avis, vous pouvez réserver un nouvel échange quand vous le souhaitez : {bookingLink}

Vous pouvez aussi répondre à cet e-mail si vous préférez m'écrire.

Bien cordialement,

Mélanie
Founder
Softn.io

—
Vous receviez ce message parce que vous aviez réservé un échange Spark sur softn.io.`,
  },
  /** Reminder sent about 24 hours before the call; it carries no calendar file. */
  reminder: {
    subject: 'Rappel : votre échange Spark, {date} à {time}',
    preheader: "C'est bientôt. Voici le lien de connexion.",
    body: `Bonjour {firstName},

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
Vous recevez ce message parce que vous avez réservé un échange Spark sur softn.io.`,
  },
  /** Wording of the calendar files: the title comes from `chatbot.booking.event.title`. */
  ics: {
    /**
     * Description of the booking and update files. `{manageLine}` is the calendar-event line of
     * `locales/fr/bookingManage.ts`, filled with the manage link, so the sentence has one source.
     */
    description: `Échange Spark : {duration} en visio, avec Softn.io.

Lien de connexion : {meetLink}

{manageLine}`,
    /** Description of the cancellation file: the appointment no longer exists, so it carries no link. */
    cancellationDescription: 'Cet échange Spark est annulé.',
  },
} as const

export type BookingEmails = typeof bookingEmails
