/** Copy of the coming-soon home page: eyebrow, title, body, waitlist form and footer. */
export const comingSoon = {
  eyebrow: 'Lancement prochain',
  title: 'Votre site, vos apps, vos automatisations.',
  body: "Je conçois votre site, vos applications, et j'automatise vos tâches répétitives avec des agents IA.",
  bodyInvite: "Le nouveau site arrive bientôt : laissez votre e-mail pour être prévenu à l'ouverture.",
  form: {
    label: 'E-mail',
    placeholder: 'vous@exemple.fr',
    submit: 'Me prévenir',
    submitBusy: 'Envoi en cours…',
    reassurance: "Un seul e-mail, à l'ouverture. Rien d'autre.",
    errorEmpty: 'Indiquez votre adresse e-mail.',
    errorInvalid: "Cette adresse e-mail n'est pas valide.",
    errorServer: "L'inscription n'a pas abouti. Réessayez dans un instant.",
    success: "C'est noté. Je vous écrirai à {email} lors du lancement.",
    privacyNotice: 'Adresse utilisée uniquement pour cet e-mail de lancement. Suppression possible sur simple demande.',
    honeypotLabel: 'Ne pas remplir ce champ',
  },
  footer: {
    copyright: '© {year} softn.io',
  },
} as const

export type ComingSoon = typeof comingSoon
