import { nav } from "./hero"

/** "Ce site" section copy: header labels and the six build steps. An empty `tech` hides the technical block. */
export const thisSite = {
  eyebrow: nav.thisSite,
  title:
    "Ce site a été construit avec des agents IA. Découvrez comment, étape par étape.",
  intro:
    "Passez la souris sur une étape pour afficher son détail : temps passé, instructions données aux agents et choix techniques.",
  introTouch:
    "Touchez une étape pour afficher son détail : temps passé, instructions données aux agents et choix techniques.",
  introKeyboard:
    "Au clavier, utilisez la touche Tabulation pour passer d'une étape à l'autre.",
  totalLabel: "Temps total suivi",
  total: "[À COMPLÉTER PAR MEL : temps réel total, d'après le suivi]",
  promptLabel: "Instructions données aux agents",
  techLabel: "Détails techniques",
  steps: [
    {
      title: "Le brief",
      time: "[À COMPLÉTER PAR MEL]",
      heading: "Un brief, puis la structure de la page",
      body: "Le point de départ : ce que je fais, pour qui, et ce que le visiteur doit comprendre en quelques secondes. Sur cette base, j'ai construit la structure et la mise en page de la page avec des textes provisoires, retravaillés ensuite.",
      prompt:
        "Des instructions détaillées et le contexte du projet, fournis aux agents dans un cadre de travail défini, et non une simple demande. [À COMPLÉTER PAR MEL si un extrait réel est souhaité]",
      tech: "Les textes sont conservés dans le dépôt Git du projet et servent de référence aux agents. La structure et la mise en page ont d'abord utilisé des textes provisoires, remplacés ensuite par les textes validés.",
      tags: [
        "Structure et mise en page",
        "Textes provisoires puis validés",
        "Référence partagée avec les agents",
      ],
    },
    {
      title: "Direction visuelle",
      time: "[À COMPLÉTER PAR MEL]",
      heading: "Une direction retenue, puis affinée section par section",
      body: "À partir du Design System existant et de la structure validée, plusieurs propositions ont été comparées. J'ai retenu les meilleurs éléments de chacune, puis je me suis concentrée sur une seule direction, affinée section par section.",
      prompt:
        "Des instructions détaillées : le  Design System déjà en place, la structure et la mise en page validées à l'étape précédente, et des consignes précises pour les agents.",
      tech: "Le Design System (couleurs, typographie, espacements, rayons) était déjà défini sous forme de variables partagées. Les propositions se sont appuyées dessus, ce qui a permis de les comparer à structure identique.",
      tags: [
        "Design System existant",
        "Structure validée",
        "Itérations par section",
      ],
    },
    {
      title: "Le code, écrit par des agents",
      time: "[À COMPLÉTER PAR MEL]",
      heading: "Un agent par expertise, une tâche par section",
      body: "Le code a été écrit par des agents IA spécialisés (développement, contenu, qualité, sécurité…), à partir de spécifications que j'ai fournies et dans un cadre contrôlé. Chaque section de la page correspond à une tâche.",
      prompt:
        "Ici, pas de simple demande : chaque tâche part d'une spécification écrite que l'agent doit respecter.",
      tech: "Claude Code, avec une branche par tâche et un cadre d'exécution structuré : spécifications, plan, exécution, tests, sécurité, relecture. L'agent ouvre une Pull Request pour chaque tâche ; la relecture et le merge sont faits par un humain.",
      tags: [
        "Specs Driven Development",
        "Un agent par expertise",
        "Relecture et merge humains",
      ],
    },
    {
      title: "La boucle de relecture",
      time: "[À COMPLÉTER PAR MEL]",
      heading: "Une méthode rendue visible",
      body: "Trois étapes : les agents IA produisent, un humain relit et valide, puis livre. Un livrable non conforme est renvoyé aux agents pour correction. L'animation se construit au fil de votre défilement.",
      prompt:
        "Des instructions précises sur le comportement attendu : représenter les trois étapes (production, relecture humaine, livraison), montrer qu'un livrable non conforme retourne à la production pour correction, et proposer une version sans animation aux personnes qui ont réduit les mouvements dans les réglages de leur appareil.",
      tech: "",
      tags: [
        "Production par les agents",
        "Relecture humaine",
        "Correction en boucle",
      ],
    },
    {
      title: "{assistantName}, l'assistant du site",
      time: "[À COMPLÉTER PAR MEL]",
      heading:
        "Un assistant qui répond à vos questions et réserve votre échange",
      body: "{assistantName} répond aux questions sur les services de Softn.io, dans un périmètre défini, puis vous aide à réserver un échange. Aucune donnée personnelle n'est demandée avant votre consentement explicite.",
      prompt:
        "Des instructions détaillées sur le comportement de l'assistant : réponses limitées au périmètre défini, consentement demandé avant toute collecte de données, champs validés avec des messages d'erreur clairs, accès permanent à la politique de confidentialité, possibilité de réessayer en cas d'erreur.",
      tech: "",
      tags: [
        "Périmètre défini",
        "Consentement avant toute saisie",
        "Validation des champs",
      ],
    },
    {
      title: "La relecture en continu",
      time: "en continu",
      heading: "Ce qui a été corrigé après relecture",
      body: "À chaque itération, le design comme le code ont été relus. Des blocs trop lourds, une animation peu visible, trop de séparateurs en thème clair, des cartes trop chargées : tout a été repris, comme je le ferai sur vos projets.",
      prompt:
        "Des retours de relecture précis, transmis aux agents : pour le design comme pour le code, chaque point relevé donne lieu à une consigne de correction, puis à une nouvelle relecture.",
      tech: "La relecture porte sur le design et sur les aspects techniques, pour garantir l'accessibilité et la facilité d'usage sur différents appareils : contrastes, navigation au clavier, taille des zones tactiles, affichage selon la largeur d'écran. [À COMPLÉTER PAR MEL : mesures réelles et plage de largeurs testée, d'après les résultats de test]",
      tags: ["Revue de code", "Accessibilité", "Tests sur plusieurs écrans"],
    },
  ],
} as const

export type ThisSite = typeof thisSite
