/** Assistant first name. Single source: texts reference it through the `{assistantName}` parameter. */
export const ASSISTANT_NAME = "Flo"

/** Chatbot copy. Parameters in braces (`{assistantName}`, `{firstName}`, `{slot}`, `{current}`, `{total}`, `{contactPageLink}`, `{dataRequestSubject}`) are filled at render time. */
export const chatbot = {
  welcome: {
    first:
      "Bonjour, je suis {assistantName}, l'assistant virtuel de Softn.io. Je suis une intelligence artificielle, pas une personne. Je peux répondre à vos questions sur les services et la méthode de Softn.io, et vous aider à réserver votre échange Spark.",
    prompt: "Que souhaitez-vous savoir ?",
  },
  disclosure: {
    inline:
      "Vous échangez avec {assistantName}, un assistant virtuel IA. Il répond dans le cadre des informations présentées sur ce site.",
    header: "{assistantName}, assistant virtuel IA",
  },
  launcher: {
    ariaLabel: "Ouvrir la discussion avec l'assistant virtuel",
  },
  panel: {
    ariaLabel: "Discussion avec {assistantName}, assistant virtuel IA",
    reset: "Recommencer la conversation",
  },
  input: {
    label: "Votre question",
    placeholder: "Écrivez votre question…",
    send: "Envoyer",
  },
  typing: {
    ariaLabel: "{assistantName} est en train d'écrire",
  },
  suggestions: {
    process: "Comment se passe un projet ?",
    review: "Comment la qualité du travail est-elle contrôlée ?",
    automation: "Qu'est-ce qui s'automatise ?",
    efficiency: "Comment gagner du temps au quotidien ?",
    notTechnical: "Faut-il être technique pour travailler avec vous ?",
    services: "Que faites-vous exactement ?",
    book: "Prendre rendez-vous",
  },
  answers: {
    process:
      "Le projet démarre par un premier échange pour comprendre vos besoins. Le travail est ensuite découpé en étapes courtes, chacune relue et validée avant d'être livrée. Vous suivez l'avancement et vous donnez votre avis tout au long du projet.",
    review:
      "Chaque livrable est relu et validé avant d'être livré. Cette double étape permet de repérer les erreurs tôt, et de les corriger avant qu'elles n'atteignent votre projet. Les étapes sont assez courtes pour que la relecture reste précise.",
    automation:
      "Cela dépend de vos besoins et de la nature des tâches. Les tâches répétitives et bien définies, comme les relances, les devis, la saisie ou le tri des e-mails, s'y prêtent bien. Pour les tâches qui demandent du jugement, l'IA peut aussi vous assister, par exemple en préparant une analyse ou un brouillon, mais la décision reste la vôtre. La limite est indiquée franchement.",
    efficiency:
      "Cela dépend de vos tâches et de vos outils. Les saisies répétitives, les relances, les devis ou le tri d'e-mails sont de bons points de départ. Un premier échange permet d'identifier ce qui peut être automatisé et d'estimer le temps gagné, sans promesse chiffrée à l'avance.",
    notTechnical:
      "Non, aucune compétence technique n'est nécessaire. La partie technique est prise en charge, les explications restent simples, et un accompagnement est prévu jusqu'à la prise en main de votre outil.",
    services:
      "Deux types de services. Créer : votre site ou votre web app, de la conception à la mise en ligne, et une application mobile si votre projet le demande. Automatiser : repérer vos tâches répétitives, mettre en place les automatisations avec vous, vous accompagner dans leur prise en main, et intégrer l'IA à vos processus métier là où elle vous est utile.",
    delay:
      "Cela dépend de l'ampleur du projet, et aucune date n'est annoncée avant d'avoir compris votre besoin. Après le premier échange, vous recevez un plan d'action sous 3 jours, puis le projet avance par livraisons régulières plutôt qu'en une seule fois.",
    price:
      "Chaque projet est chiffré après l'échange, selon son ampleur. Le plan d'action, lui, est offert.",
    ownership:
      "Oui, ce qui est réalisé pour vous vous appartient. Les modalités précises, dont le moment du transfert, sont fixées dans le devis.",
    human:
      "Non, je suis un assistant virtuel fonctionnant avec l'intelligence artificielle. Si vous réservez un échange Spark, votre demande sera lue avant le rendez-vous.",
    fallback:
      "Je ne peux répondre qu'aux questions sur les services de Softn.io : méthode, délais, tarifs, types de projets. Pour tout autre sujet, le plus simple est de réserver votre échange Spark ou d'utiliser le formulaire de contact : {contactPageLink}. Souhaitez-vous réserver votre échange ?",
  },
  booking: {
    intro:
      "Volontiers. L'échange Spark est offert et sans engagement. Je vais vous poser quelques questions rapides pour préparer la réservation.",
    steps: {
      firstName: {
        question: "Quel est votre prénom ?",
        field: "Prénom",
      },
      lastName: {
        question: "Et votre nom ?",
        field: "Nom",
      },
      email: {
        question: "Quelle adresse e-mail pour l'invitation ?",
        field: "E-mail",
        error: "Veuillez fournir une adresse e-mail valide.",
      },
      phone: {
        question:
          "Un numéro de téléphone, au cas où l'appel serait interrompu ? (facultatif)",
        field: "Téléphone",
        error: "Veuillez fournir un numéro de téléphone valide.",
      },
      structure: {
        question: "Quel type de structure représentez-vous ? (facultatif)",
        field: "Structure",
        options: ["Indépendant", "TPE", "PME", "Association", "Autre"],
      },
      role: {
        question: "Quelle est votre fonction ? (facultatif)",
        field: "Fonction",
        options: [
          "Dirigeant",
          "Opérations",
          "Marketing",
          "Technique ou produit",
          "Autre",
        ],
      },
      need: {
        question: "En une phrase, quel est votre besoin ?",
        field: "Besoin",
        example: "Automatiser mes devis",
      },
      slot: {
        question: "Quel créneau vous convient ?",
        field: "Créneau",
      },
      skip: "Passer cette question",
    },
    step: "Question {current} sur {total}",
    recap: {
      title: "Récapitulatif avant envoi",
      confirm: "Confirmer et envoyer",
      edit: "Modifier une réponse",
    },
    cancel: "Annuler la prise de rendez-vous",
    cancelled:
      "La prise de rendez-vous est annulée. Aucune donnée n'a été envoyée.",
    success: {
      title: "Demande enregistrée",
      message:
        "Merci {firstName}. Votre demande pour le créneau « {slot} » est enregistrée. Vous recevrez une invitation à l'adresse indiquée.",
      restart: "Recommencer",
    },
  },
  consent: {
    message:
      "Avant de poursuivre : pour réserver, j'ai besoin de votre prénom, de votre nom, de votre adresse e-mail et de quelques informations sur votre projet. Ces données sont transmises à Softn.io pour organiser l'échange et vous envoyer l'invitation. Vous pouvez demander leur suppression à tout moment. Le détail figure dans la politique de confidentialité.",
    link: {
      label: "Politique de confidentialité",
      href: "/politique-de-confidentialite",
    },
    accept:
      "J'accepte que mes informations soient utilisées pour organiser l'échange",
    decline: "Je préfère ne pas donner mes informations",
    declined:
      "C'est entendu, aucune donnée n'est collectée. Vous pouvez poursuivre la conversation, ou contacter Softn.io via le formulaire de contact : {contactPageLink}.",
    accepted: "Merci. Nous pouvons commencer.",
  },
  error: {
    generic:
      "Un incident s'est produit. Votre demande n'a pas été envoyée. Vous pouvez réessayer dans un instant.",
    retry: "Réessayer",
    network: "La connexion semble interrompue. Vérifiez-la, puis réessayez.",
    booking:
      "La réservation n'a pas abouti et aucune donnée n'a été conservée. Vous pouvez réessayer, ou utiliser le formulaire de contact : {contactPageLink}. [À CONFIRMER PAR chatbot-dev : vrai seulement si aucune écriture Airtable n'a eu lieu.]",
    slotTaken:
      "Ce créneau n'est plus disponible. Veuillez en choisir un autre, s'il vous plaît.",
  },
  loading: {
    message: "Un instant…",
  },
  dataRequest:
    "Pour consulter, corriger ou supprimer vos données, suivez la procédure décrite dans la politique de confidentialité, ou utilisez le formulaire de contact : {contactPageLink}, en choisissant l'objet « {dataRequestSubject} ».",
} as const

export type Chatbot = typeof chatbot
