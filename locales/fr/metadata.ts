/** SEO metadata copy for the home page, the legal pages and the JSON-LD structured data. */
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
      "Sites, web apps, automatisation et agents IA. Le nouveau site arrive bientôt : laissez votre e-mail, je vous écris à l'ouverture.",
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
  structuredData: {
    professionalService: {
      name: 'Softn.io',
      description:
        'Automatisations et agents IA au sein de vos sites et applications, là où ils vous font gagner du temps.',
      areaServed: 'France',
      serviceType: [
        'Création de sites web et de web apps',
        'Automatisation des tâches répétitives',
        "Mise en place d'agents IA",
      ],
    },
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
