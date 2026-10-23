/** SEO metadata copy for the home page and the legal pages. */
export const metadataContent = {
  home: {
    title: 'Softn.io | Automatisation et agents IA pour TPE et PME',
    description:
      "Je crée votre site et vos web apps, j'automatise vos tâches répétitives avec des agents IA. Échange Spark offert, plan d'action sous 3 jours.",
    openGraph: {
      title: 'Softn.io : sites, web apps, automatisation et agents IA',
      description:
        "Création de sites et d'applications, automatisation avec des agents IA. Échange Spark offert, plan d'action sous 3 jours, relecture humaine à chaque étape.",
      locale: 'fr_FR',
    },
  },
  comingSoon: {
    title: 'Softn.io | Automatisation et agents IA, bientôt en ligne',
    description:
      "Je crée votre site et vos web apps, et j'automatise vos tâches répétitives avec des agents IA. Le site complet de Softn.io arrive bientôt.",
    openGraph: {
      title: 'Softn.io : sites, web apps, automatisation et agents IA',
      description:
        "Création de sites et d'applications, automatisation avec des agents IA. Le site complet de Softn.io arrive bientôt.",
      locale: 'fr_FR',
    },
  },
  preview: {
    title: 'Aperçu | Softn.io',
  },
  legal: {
    mentions: {
      title: 'Mentions légales | Softn.io',
      description: 'Éditeur et hébergeur du site softn.io.',
    },
    privacy: {
      title: 'Politique de confidentialité | Softn.io',
      description:
        'Données personnelles collectées sur softn.io : finalités, durées de conservation et exercice des droits.',
    },
    cookies: {
      title: 'Politique de cookies | Softn.io',
      description: 'Les cookies utilisés sur softn.io, leur finalité et la gestion du choix de chaque visiteur.',
    },
  },
} as const

export type MetadataContent = typeof metadataContent
