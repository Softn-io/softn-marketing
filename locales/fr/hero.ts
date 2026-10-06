/** Shared labels reused by several sections (booking and assistant calls to action). */
export const common = {
  cta: {
    book: "Réserver mon échange Spark",
    bookNote:
      "Offert et sans engagement. Nous échangeons sur votre quotidien et votre projet pour construire un plan d'action qui vous aide à avancer.",
    askFlo: "Poser ma question à {assistantName}",
  },
} as const

export type Common = typeof common

/** Header navigation labels, theme toggle and accessibility strings. */
export const nav = {
  logo: {
    ariaLabel: "softn.io, retour à l'accueil",
  },
  offers: "Services pour votre activité",
  method: "Un projet suivi pas à pas",
  agent: "{assistantName}, l'assistant",
  thisSite: "Les coulisses de ce site",
  faq: "Questions fréquentes",
  cta: common.cta.book,
  themeToggle: {
    toLight: "Passer au mode clair",
    toDark: "Passer au mode sombre",
  },
  menu: {
    ariaLabel: "Menu",
  },
  skipLink: "Aller au contenu principal",
} as const

export type Nav = typeof nav

/** Hero section copy. The three title lines are rendered inside a single h1. */
export const hero = {
  eyebrow: "Sites · Apps · Automatisations · IA",
  title: {
    line1: "Votre site,",
    line2: "vos apps,",
    line3: "vos automatisations et agents IA.",
  },
  subtitle:
    "Votre site, vos applications et vos automatisations, réalisés avec l'appui d'agents IA et relus par un humain à chaque étape. L'IA peut aussi s'intégrer à vos processus métier, là où elle vous est utile. Je vous accompagne de l'idée à la prise en main.",
  cta: {
    primary: "Recevoir mon plan d'action",
    secondary: "Découvrir comment je vous accompagne",
  },
  reassurance:
    "L'échange Spark est offert. Vous recevez votre plan d'action sous 3 jours.",
  agentPrompt: "Une question ? {assistantName}, l'assistant virtuel, vous répond",
} as const

export type Hero = typeof hero

/** Final call-to-action section (`#appel`). */
export const appel = {
  title: "L'échange Spark, offert, pour avancer sur votre projet.",
  body: "Vous décrivez votre situation et votre projet : un site, une application, des tâches à automatiser ou l'intégration de l'IA à vos processus métier. Je vous dis ce qui est réalisable et par où commencer. Vous recevez votre plan d'action sous 3 jours, même si nous n'allons pas plus loin.",
  cta: common.cta.book,
} as const

export type Appel = typeof appel
