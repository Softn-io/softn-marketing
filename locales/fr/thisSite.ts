import { nav } from './hero'

/** Time measured on one step: the pilot's count and the agents' count, one pair per tracked step. */
export type ThisSiteStepDurations = {
  readonly mel: string
  readonly agents: string
}

/** One step of the "Ce site" section: what an agent was asked, what it produced and what it cost. */
export type ThisSiteStepCopy = {
  readonly title: string
  readonly heading: string
  readonly body: string
  readonly prompt: string
  /** Empty on the steps with nothing technical to say: the detail then hides that block. */
  readonly tech: string
  readonly tags: readonly string[]
  /** Measured time, on the steps that carry one; the steps without a count have none. */
  readonly durations?: ThisSiteStepDurations
}

const steps: readonly ThisSiteStepCopy[] = [
  {
    title: 'Le brief',
    heading: 'Un brief, puis la structure de la page',
    body: "Le point de départ : ce que je fais, pour qui, et ce que le visiteur doit comprendre en quelques secondes. Sur cette base, j'ai construit la structure et la mise en page de la page avec des textes provisoires, retravaillés ensuite.",
    prompt:
      'Des instructions détaillées et le contexte du projet, fournis aux agents dans un cadre de travail défini, et non une simple demande.',
    tech: "Les textes sont conservés dans le dépôt Git du projet et servent de référence aux agents. La structure et la mise en page ont d'abord utilisé des textes provisoires, remplacés ensuite par les textes validés.",
    tags: ['Brief détaillé', 'Structure de page', 'Textes de référence'],
  },
  {
    title: 'Direction visuelle',
    heading: 'Une direction retenue, puis affinée section par section',
    body: "À partir du Design System existant et de la structure validée, plusieurs propositions ont été comparées. J'ai retenu les meilleurs éléments de chacune, puis je me suis concentrée sur une seule direction, affinée section par section.",
    prompt:
      "Des instructions détaillées : le Design System déjà en place, la structure et la mise en page validées à l'étape précédente, et des consignes précises pour les agents.",
    tech: 'Le Design System (couleurs, typographie, espacements, rayons) était déjà défini sous forme de variables partagées. Les propositions se sont appuyées dessus, ce qui a permis de les comparer à structure identique.',
    tags: ['Design System', 'Pistes comparées', 'Affinage par section'],
  },
  {
    title: 'Le code, écrit par des agents',
    heading: 'Un agent par expertise',
    body: "Le code a été écrit par des agents IA spécialisés (développement, contenu, qualité, sécurité…), dans un cadre contrôlé, à partir de spécifications que j'ai fournies. Chaque section de la page a donné lieu à une ou plusieurs tâches, selon sa complexité.",
    prompt: "Ici, pas de simple demande : chaque tâche part d'une spécification écrite que l'agent doit respecter.",
    tech: "Chaque tâche suit un cadre d'exécution structuré : spécification, plan, exécution, revue de code, tests, contrôle de sécurité. Elle est menée sur sa propre branche, et l'agent ouvre une Pull Request pour chaque tâche ; la relecture et la fusion sont faites par un humain.",
    tags: ['Agents IA spécialisés', 'Specs Driven Development', 'Relecture humaine'],
    durations: { mel: 'environ 10\u00A0h', agents: 'environ 40\u00A0h' },
  },
  {
    title: 'La boucle de relecture',
    heading: 'Une méthode rendue visible',
    body: "Trois étapes : les agents IA produisent, un humain relit et valide, puis livre. Un livrable non conforme est renvoyé aux agents pour correction. L'animation se construit au fil de votre défilement.",
    prompt:
      "Des instructions précises sur le comportement attendu : représenter les trois étapes (production, relecture humaine, livraison), montrer qu'un livrable non conforme retourne à la production pour correction, et proposer une version sans animation aux personnes qui ont réduit les mouvements dans les réglages de leur appareil.",
    tech: '',
    tags: ['Agents IA', 'Relecture humaine', 'Boucle de correction'],
    durations: { mel: 'environ 1\u00A0h', agents: 'environ 7\u00A0h' },
  },
  {
    title: "{assistantName}, l'assistant du site",
    heading: 'Un assistant qui répond à vos questions et réserve votre échange',
    body: "{assistantName} répond aux questions sur les services de Softn.io, dans un périmètre défini. Vous pouvez ensuite réserver un échange directement dans la conversation : après votre consentement, vous indiquez votre besoin, choisissez un créneau parmi les disponibilités réelles, puis vos coordonnées. La réservation est automatisée : le rendez-vous est créé avec son lien de visioconférence, votre demande est enregistrée, et vous recevez un e-mail de confirmation, puis un rappel 24\u00A0h avant, avec un lien pour déplacer ou annuler le rendez-vous. Aucune donnée personnelle n'est demandée avant votre consentement explicite.",
    prompt:
      "Des instructions détaillées sur le comportement de l'assistant : réponses limitées au périmètre défini, consentement demandé avant toute collecte de données, champs validés avec des messages d'erreur clairs, accès permanent à la politique de confidentialité, possibilité de réessayer en cas d'erreur.",
    tech: '',
    tags: ['Assistant IA', 'Réservation automatisée', 'Consentement préalable'],
    durations: { mel: 'environ 13\u00A0h', agents: 'environ 39\u00A0h' },
  },
  {
    title: 'La relecture en continu',
    heading: 'Ce qui a été corrigé après relecture',
    body: "À chaque itération, le design comme le code ont été relus. Sur le plan technique, chaque tâche passe par une revue de code, des tests automatisés, des vérifications d'accessibilité et un contrôle de sécurité avant validation et livraison. Côté design, des blocs trop lourds, une animation peu visible, trop de séparateurs en thème clair et des cartes trop chargées ont été repris, comme je le ferai sur vos projets.",
    prompt:
      'Des retours de relecture précis, transmis aux agents : pour le design comme pour le code, chaque point relevé donne lieu à une consigne de correction, puis à une nouvelle relecture.',
    tech: "La relecture porte sur le design et sur les aspects techniques, pour favoriser l'accessibilité et la facilité d'usage sur différents appareils : contraste d'au moins 5,9:1, navigation complète au clavier, affichage vérifié de 320 à 1920\u00A0px.",
    tags: ['Revue de code', 'Tests automatisés', 'Accessibilité et sécurité'],
  },
]

/** "Ce site" section copy: header labels, measured total and the six build steps. An empty `tech` hides the technical block. */
export const thisSite = {
  eyebrow: nav.thisSite,
  title: 'Ce site a été construit avec des agents IA. Découvrez comment, étape par étape.',
  intro:
    'Passez la souris sur une étape pour afficher son détail : temps passé, instructions données aux agents et choix techniques.',
  introTouch:
    'Touchez une étape pour afficher son détail : temps passé, instructions données aux agents et choix techniques.',
  introKeyboard: "Au clavier, utilisez la touche Tabulation pour passer d'une étape à l'autre.",
  durationMelLabel: 'Mon temps de pilotage',
  durationAgentsLabel: 'Temps de travail des agents',
  totalLabel: 'Temps total mesuré (développement uniquement)',
  total: { mel: 'environ 24\u00A0h', agents: 'environ 86\u00A0h' },
  totalScope:
    'Ce total couvre la boucle suivie pour chaque tâche : développement, revue de code, tests unitaires et de bout en bout, audit de sécurité, puis ma relecture avant toute fusion.',
  durationNote: 'Ces temps proviennent des journaux de session des outils utilisés.',
  promptLabel: 'Instructions données aux agents',
  /** French quotation marks around the instructions, bound to them by a narrow no-break space: language-specific punctuation, which an English locale would write its own way. */
  promptQuotes: { open: '«\u202F', close: '\u202F»' },
  techLabel: 'Détails techniques',
  steps,
} as const

export type ThisSite = typeof thisSite
