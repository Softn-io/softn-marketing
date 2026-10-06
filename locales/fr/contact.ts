/** Contact page copy. Parameters in braces (`{agentLink}`, `{privacyLink}`, `{min}`, `{firstName}`) are filled at render time. */
export const contact = {
  meta: {
    title: "Contact | Softn.io",
    description:
      "Une question, une demande de devis ou un projet à décrire : écrivez à Softn.io via le formulaire de contact.",
    robots: "index, follow",
  },
  link: {
    href: "/contact",
    label: "Page de contact",
  },
  header: {
    backLink: {
      label: "Retour au site",
      ariaLabel: "Retour à la page d'accueil de Softn.io",
    },
  },
  eyebrow: "Contact",
  title: "Écrivez-moi.",
  intro: {
    body: "Une question, une demande de devis ou un projet à décrire : laissez-moi un message. Vous pouvez aussi réserver directement {agentLink}.",
    agentLink: {
      label: "votre échange Spark avec {assistantName}, l'assistant virtuel",
      href: "/#agent",
    },
  },
  form: {
    ariaLabel: "Formulaire de contact",
    requiredNote: "Tous les champs sont obligatoires.",
    firstName: {
      label: "Prénom",
      placeholder: "Prénom",
    },
    lastName: {
      label: "Nom",
      placeholder: "Nom",
    },
    email: {
      label: "Adresse e-mail",
      placeholder: "vous@exemple.fr",
      help: "Cette adresse sert uniquement à vous répondre.",
    },
    subject: {
      label: "Objet",
      placeholder: "Choisir un objet",
      options: {
        project: "Nouveau projet",
        quote: "Demande de devis",
        partnership: "Partenariat",
        dataRequest: "Demande relative à mes données personnelles",
        other: "Autre",
      },
      dataRequest: {
        help: "Précisez dans votre message le droit que vous souhaitez exercer (accès, rectification, suppression…). Le détail figure dans la {privacyLink}.",
      },
    },
    message: {
      label: "Message",
      placeholder: "Décrivez votre besoin en quelques lignes",
      help: "{min} caractères minimum.",
    },
    submit: "Envoyer le message",
    honeypot: {
      label: "Ne pas remplir ce champ",
    },
  },
  consent: {
    notice:
      "Les informations saisies sont utilisées par Softn.io pour répondre à votre message. Elles ne sont transmises qu'au moment de l'envoi du formulaire. Le détail figure dans la {privacyLink}.",
    privacyLink: {
      label: "politique de confidentialité",
      href: "/politique-de-confidentialite",
    },
    checkbox: {
      label:
        "J'accepte que Softn.io utilise les informations saisies pour répondre à ma demande.",
    },
  },
  errors: {
    consent: "Veuillez accepter pour envoyer votre message.",
    firstName: {
      required: "Veuillez indiquer votre prénom.",
    },
    lastName: {
      required: "Veuillez indiquer votre nom.",
    },
    email: {
      required: "Veuillez indiquer votre adresse e-mail.",
      invalid: "Veuillez fournir une adresse e-mail valide.",
    },
    subject: {
      required: "Veuillez choisir un objet.",
    },
    message: {
      required: "Veuillez écrire votre message.",
      tooShort: "Votre message est trop court : {min} caractères minimum.",
    },
    summary:
      "Le formulaire contient des erreurs. Veuillez les corriger avant d'envoyer votre message.",
  },
  status: {
    sending: {
      label: "Envoi du message en cours…",
      ariaLabel: "Envoi du message en cours",
    },
  },
  success: {
    title: "Message envoyé.",
    body: "Merci {firstName}. Votre message a bien été envoyé. Je reviendrai vers vous dans les plus brefs délais.",
    backLink: "Retour au site",
  },
  error: {
    generic: {
      title: "Le message n'a pas pu être envoyé.",
      body: "Un incident s'est produit. Veuillez réessayer dans un instant.",
    },
    network: {
      body: "La connexion semble interrompue. Vérifiez-la, puis réessayez.",
    },
    rateLimit: {
      body: "Trop de tentatives. Veuillez patienter quelques instants avant de réessayer.",
    },
    retry: "Réessayer",
    dataKept: "Les informations saisies sont conservées dans le formulaire.",
  },
  a11y: {
    status: {
      sent: "Votre message a été envoyé.",
      error: "L'envoi du message a échoué.",
    },
    skipLink: "Aller au formulaire de contact",
  },
  fallback: {
    unavailable:
      "Le formulaire est momentanément indisponible. Veuillez réessayer plus tard.",
    noScript:
      "Le formulaire de contact nécessite JavaScript. Veuillez l'activer, puis recharger la page.",
  },
} as const

export type Contact = typeof contact
