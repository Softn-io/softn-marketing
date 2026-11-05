/**
 * Booking management copy, reached from the signed link of the calendar invitation.
 *
 * Parameters in braces (`{slot}`, `{newSlot}`, `{hours}`, `{link}`, `{contactLink}`) are filled at
 * render time. The page never writes a date or a plural by hand, and never shows the visitor's name:
 * no `{firstName}` appears in this file.
 */
export const bookingManage = {
  meta: {
    title: 'Gérer mon rendez-vous | Softn.io',
  },
  /** Wording of the manage line the calendar event description carries, read in the invitation. */
  calendarEvent: {
    line: 'Un empêchement ? Vous pouvez modifier ou annuler ce rendez-vous en ligne : {link}',
    linkLabel: 'Modifier ou annuler mon rendez-vous',
  },
  /** Eyebrow above the heading, per view. */
  eyebrow: {
    overview: 'Votre rendez-vous',
    reschedule: 'Reprogrammer',
    cancel: 'Annuler',
    moved: 'Rendez-vous déplacé',
    cancelled: 'Rendez-vous annulé',
  },
  title: 'Votre échange Spark',
  intro:
    "Vous pouvez déplacer ce rendez-vous à un autre moment, ou l'annuler. Le déplacement est possible en ligne jusqu'à {hours} h avant l'appel.",
  /** Recap of the appointment: its date and its format, never a personal field. */
  recap: {
    date: 'Date',
    format: 'Format',
    formatValue: "30 min, en visio. Le lien est dans l'e-mail de confirmation.",
  },
  reschedule: {
    action: 'Choisir un autre créneau',
    /** Quiet control that leaves the chooser without changing anything. */
    back: 'Retour',
    /** Quiet control of the moved view that opens the chooser again. */
    changeAgain: 'Modifier de nouveau',
    chooser: {
      title: 'Choisissez votre nouveau créneau',
      timezoneNote: 'Les horaires sont indiqués en heure de Paris.',
      dayLabel: 'Jour',
      timeLabel: 'Heure · {day}',
    },
    loading: 'Je consulte les disponibilités…',
    empty:
      "Je ne trouve aucun créneau disponible pour le moment. Vous pouvez conserver votre rendez-vous actuel, ou m'écrire via le {contactLink}.",
    confirm: {
      title: 'Confirmer le nouveau créneau',
      summary: 'Votre échange Spark passera de « {slot} » à « {newSlot} ».',
      submit: 'Confirmer ce créneau',
      back: 'Choisir un autre créneau',
    },
    success: {
      title: 'Rendez-vous déplacé',
      message:
        "Votre échange Spark est maintenant fixé au créneau « {slot} ». Vous allez recevoir un e-mail avec l'invitation mise à jour.",
    },
  },
  cancel: {
    action: 'Annuler le rendez-vous',
    /** Optional reason of the cancellation: a chip writes its label, never free text. */
    reason: {
      label: 'Une raison ? (facultatif)',
      options: {
        prevented: 'Empêchement',
        'no-longer-needed': 'Report de projet',
        'found-alternative': 'Solution trouvée',
        other: 'Autre',
      },
    },
    confirm: {
      question: 'Souhaitez-vous vraiment annuler votre échange Spark prévu le « {slot} » ?',
      submit: 'Oui, annuler le rendez-vous',
      back: 'Non, conserver le rendez-vous',
    },
    success: {
      title: 'Rendez-vous annulé',
      message:
        "Votre échange Spark est annulé. Vous allez recevoir un e-mail de confirmation d'annulation. Si vous changez d'avis, vous pourrez réserver un nouvel échange quand vous le souhaitez.",
      bookAgain: 'Réserver un nouvel échange Spark',
    },
  },
  /** States the link or the calendar can put the page in, outside the two actions. */
  states: {
    late: {
      title: "Ce rendez-vous n'est plus modifiable",
      message:
        "Votre rendez-vous a lieu dans moins de {hours} h : il ne peut plus être déplacé depuis cette page. Pour changer d'horaire, écrivez-moi via le {contactLink}. Vous pouvez aussi l'annuler ici.",
    },
    started: {
      title: "Ce rendez-vous n'est plus modifiable",
      message:
        "L'appel a déjà commencé ou le lien a expiré : aucune action n'est possible depuis cette page. Pour toute question, écrivez-moi via le {contactLink}.",
    },
    cancelled: {
      title: 'Rendez-vous déjà annulé',
      message: 'Ce rendez-vous a déjà été annulé. Si vous le souhaitez, vous pouvez réserver un nouvel échange Spark.',
      bookAgain: 'Réserver un nouvel échange Spark',
    },
    invalid: {
      title: 'Lien non valide',
      message:
        "Ce lien ne permet pas d'afficher un rendez-vous. Utilisez le lien de l'e-mail ou de l'invitation que vous avez reçus, ou écrivez-moi via le {contactLink}.",
    },
  },
  /** Failures a request or the availability can answer, mapped from their codes. */
  errors: {
    slotTaken: "Ce créneau vient d'être réservé. Veuillez en choisir un autre, s'il vous plaît.",
    unavailable:
      "Le service est momentanément indisponible. Votre rendez-vous n'a pas été modifié. Vous pouvez réessayer dans un instant, ou m'écrire via le {contactLink}.",
    retry: 'Réessayer',
    rateLimit: 'Trop de tentatives. Veuillez patienter quelques instants avant de réessayer.',
  },
  /** Way back to the contact page, written in lowercase because it reads inside a sentence. */
  contact: {
    sentence: "Pour toute autre demande, vous pouvez m'écrire via le {contactLink}.",
    linkLabel: 'formulaire de contact',
    href: '/contact',
  },
} as const

export type BookingManage = typeof bookingManage
