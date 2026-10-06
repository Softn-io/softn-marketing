import { common, nav } from "./hero"

/** Offers section copy: shared header strings and the two offer cards with their detail sheets. */
export const offers = {
  eyebrow: nav.offers,
  hint: "Sélectionnez une carte pour voir comment je peux vous aider.",
  detailLink: "Détail",
  srTitle: "Deux façons de travailler ensemble : créer et automatiser",
  create: {
    kicker: "01 — Créer",
    cardTitle: "Votre site et votre web app",
    cardText:
      "De la conception à la mise en ligne, avec de l'IA là où elle vous est utile.",
    audiences: ["Indépendants", "TPE et PME", "Porteurs de projet"],
    sheet: {
      title: "Votre site et votre web app",
      intro:
        "De l'idée à la mise en ligne, je conçois une interface claire pour vos utilisateurs et je la développe avec soin. Quand l'IA ou l'automatisation apporte un vrai bénéfice à votre projet, je les intègre.",
      gainsLabel: "Ce que comprend l'accompagnement",
      items: [
        {
          title: "Sites web et plateformes sur mesure",
          text: "Sites de présentation, e-commerce, espaces clients ou autres plateformes : chaque site est conçu selon vos besoins. Les contenus sont structurés avec vous, le référencement est soigné et la mise en ligne est incluse.",
        },
        {
          title: "Web apps et outils métier",
          text: "Un outil qui remplace votre tableur ou vos tâches manuelles : devis, réservations, suivi de dossiers, tableaux de bord, et bien d'autres usages. Il est adapté à votre activité.",
        },
        {
          title: "Fonctions d'IA intégrées au projet",
          text: "Recherche en langage naturel, rédaction assistée, extraction d'informations depuis vos documents, assistant de réponse comme celui de cette page. D'autres fonctions d'IA sont possibles, selon vos besoins.",
        },
        {
          title: "Applications mobiles iOS et Android",
          text: "Si votre projet le demande, une application publiée sur les stores, avec les fonctionnalités adaptées à votre usage.",
        },
      ],
      phasesLabel: "Déroulement du projet",
      phases: [
        "Cadrage : comprendre vos besoins et vos contraintes, et définir le périmètre du projet",
        "Conception : recherche de design, écrans et parcours utilisateurs",
        "Prototype : une première version cliquable, pour recueillir vos premiers retours",
        "Itérations : des cycles courts, avec vos retours à chaque étape et des livraisons progressives, chacune relue avant d'être livrée",
        "Prise en main : accompagnement à l'utilisation, documentation claire et suivi dans la durée",
      ],
      whoLabel: "Pour qui",
      who: "Indépendants, TPE et PME, porteurs de projet. Aucune équipe technique n'est nécessaire : je prends en charge toute la partie technique et je reste à vos côtés après la mise en ligne, pour l'utilisation et l'évolution de votre outil.",
      cta: {
        primary: common.cta.book,
        secondary: common.cta.askFlo,
      },
    },
  },
  automate: {
    kicker: "02 — Automatiser",
    cardTitle: "Vos tâches répétitives, confiées à l'IA",
    cardText:
      "Je repère ce qui vous fait perdre du temps, je mets en place les automatisations avec vous, puis je vous accompagne jusqu'à ce que vous soyez à l'aise pour les piloter.",
    audiences: [
      "Indépendants et entrepreneurs",
      "Petites équipes",
      "Équipes techniques",
    ],
    sheet: {
      title: "Vos tâches répétitives, confiées à l'IA",
      intro:
        "E-mails, relances, devis, saisies : ces tâches prennent du temps et se répètent. Je commence par étudier votre façon de travailler, puis je conçois et je mets en place des automatisations adaptées à vos outils, en vous laissant la décision. Les agents IA interviennent là où ils vous font gagner du temps, avec des garde-fous.",
      items: [
        {
          title:
            "Étude de vos processus et repérage des automatisations possibles",
          text: "J'observe votre quotidien réel : e-mails, relances, saisies, copier-coller entre outils. Vous ressortez avec une liste priorisée, accompagnée d'une estimation du temps gagné.",
        },
        {
          title: "Mise en place de vos workflows",
          text: "Je connecte vos outils existants et j'automatise les tâches qui vous freinent : devis, factures, relances, tri de boîte mail, mise à jour de catalogue, et bien d'autres. Les automatisations s'intègrent à votre environnement de travail. Chacune comporte un garde-fou et une alerte en cas d'échec.",
        },
        {
          title:
            "Encadrer l'usage des agents IA dans votre équipe de développement",
          text: "Je vous aide à intégrer des agents IA à votre façon de développer, avec Claude Code : découpage du travail en tâches courtes, spécifications écrites, une branche et une revue de code par tâche, validation humaine avant merge, droits des agents limités. Nous définissons aussi ce qui ne se délègue pas à un agent. Le travail se fait sur un dépôt de test ou une copie de votre projet.",
        },
        {
          title: "Prise en main et suivi",
          text: "Vous apprenez à lire, relancer et arrêter chaque automatisation, avec une documentation courte et un point de suivi pour ajuster. Si vous préférez ne pas les gérer vous-même, le suivi peut m'être confié.",
        },
      ],
      phases: [
        "Observation : ce que vous faites vraiment, à la main",
        "Liste priorisée : temps gagné estimé, ordre de priorité",
        "Mise en place workflow par workflow, testés avec vous",
        "Transfert : vous pilotez si vous êtes à l'aise, je reste disponible en cas de besoin, ou je continue d'assurer le suivi si vous le préférez",
      ],
      who: "Indépendants, petites équipes et structures sans compétences techniques, ainsi que les équipes de développement qui souhaitent encadrer leur usage des agents IA.",
      cta: {
        primary: common.cta.book,
        secondary: common.cta.askFlo,
      },
    },
  },
} as const

export type Offers = typeof offers
