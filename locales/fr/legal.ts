/** Legal pages copy: legal notice, privacy policy and cookie policy. Parameters in braces (`{contactPageLink}`, `{dataRequestSubject}`) are filled at render time. */
export const legal = {
  mentions: {
    title: "Mentions légales",
    updated: "Dernière mise à jour : [À COMPLÉTER PAR MEL : date]",
    sections: {
      publisher: {
        title: "Éditeur du site",
        body: "Le site softn.io est édité par [À COMPLÉTER PAR MEL : nom et prénom, ou dénomination sociale]. Statut : [À COMPLÉTER PAR MEL : entrepreneur individuel, micro-entreprise, société…].",
      },
      director: {
        title: "Directrice de la publication",
        body: "[À COMPLÉTER PAR MEL : nom de la personne responsable de la publication]",
      },
      host: {
        title: "Hébergeur",
        body: "Le site est hébergé par Vercel. [À COMPLÉTER PAR MEL après vérification sur le site de Vercel : dénomination sociale, adresse du siège, contact.]",
      },
      ip: {
        title: "Propriété intellectuelle",
        body: "Les textes, l'identité visuelle et les éléments graphiques de ce site sont la propriété de l'éditeur, sauf mention contraire. Toute reproduction sans autorisation écrite est interdite. [À CONFIRMER PAR MEL : polices et icônes sous licence à mentionner.]",
      },
      data: {
        title: "Données personnelles et cookies",
        body: "Le traitement des données personnelles est décrit dans la politique de confidentialité et la politique de cookies.",
      },
    },
    publisher: {
      siret: "SIRET : [À COMPLÉTER PAR MEL]",
      vat: "TVA intracommunautaire : [À COMPLÉTER PAR MEL, ou « non applicable »]",
      address: "Adresse : [À COMPLÉTER PAR MEL : adresse professionnelle]",
      contact: "Contact : {contactPageLink}",
    },
  },
  privacy: {
    title: "Politique de confidentialité",
    updated: "Dernière mise à jour : [À COMPLÉTER PAR MEL : date]",
    intro:
      "Cette page présente les données personnelles collectées sur softn.io, leurs finalités, leur durée de conservation et les modalités d'exercice des droits des personnes concernées.",
    sections: {
      controller: {
        title: "Responsable du traitement",
        body: "Le responsable du traitement est [À COMPLÉTER PAR MEL : nom, statut, adresse]. Contact : {contactPageLink}.",
      },
      collected: {
        title: "Données collectées",
        intro: "Selon l'utilisation du site, les données suivantes peuvent être traitées :",
      },
      purposes: {
        title: "Finalités et bases légales",
      },
      processors: {
        title: "Destinataires des données",
      },
      transfers: {
        title: "Transferts hors de l'Union européenne",
        body: "Certains prestataires peuvent traiter des données hors de l'Union européenne. Le cas échéant, le transfert est encadré par une décision d'adéquation (y compris le Data Privacy Framework pour les entreprises certifiées) ou par des clauses contractuelles types. [À COMPLÉTER PAR MEL après vérification, prestataire par prestataire.]",
      },
      retention: {
        title: "Durées de conservation",
      },
      rights: {
        title: "Droits des personnes",
      },
      security: {
        title: "Sécurité des données",
      },
      ai: {
        title: "Assistant virtuel",
      },
      changes: {
        title: "Modifications",
      },
    },
    collected: {
      booking:
        "Lors d'une prise de rendez-vous avec l'assistant : prénom, nom, adresse e-mail, téléphone (facultatif), type de structure (facultatif), fonction (facultatif), description du besoin, créneau choisi, et trace du consentement.",
      contact:
        "Lors de l'envoi d'un message via le formulaire de contact : prénom, nom, adresse e-mail, objet du message, contenu du message et trace du consentement. Finalité : répondre au message. Durée de conservation : [À COMPLÉTER PAR MEL : durée à décider].",
      technical:
        "À chaque visite : adresse IP et données techniques nécessaires au fonctionnement et à la sécurité du site (journaux d'hébergement).",
      audience:
        "Avec le consentement du visiteur : statistiques de navigation anonymisées, pour comprendre comment le site est utilisé.",
    },
    purposes: {
      booking:
        "Organiser l'échange découverte, envoyer l'invitation et préparer le plan d'action. Base légale : consentement de la personne, recueilli avant toute saisie dans l'assistant.",
      technical:
        "Assurer le fonctionnement et la sécurité du site. Base légale : intérêt légitime.",
      audience:
        "Mesurer l'audience du site. Base légale : consentement, recueilli par le bandeau de cookies.",
      note: "[À FAIRE VALIDER : bases légales proposées à confirmer par la relecture RGPD.]",
    },
    processors: {
      intro:
        "Softn.io fait appel à des prestataires (sous-traitants) pour faire fonctionner le site. Ils traitent les données pour son compte :",
      airtable:
        "Airtable : enregistrement des demandes de rendez-vous. Hébergement et garanties de transfert : [À COMPLÉTER PAR MEL après vérification].",
      fillout:
        "Fillout : réservation du créneau. Hébergement et garanties de transfert : [À COMPLÉTER PAR MEL après vérification].",
      google:
        "Google Calendar : agenda des rendez-vous, via Fillout. Hébergement et garanties de transfert : [À COMPLÉTER PAR MEL après vérification].",
      vercel:
        "Vercel : hébergement du site et journaux techniques. Hébergement et garanties de transfert : [À COMPLÉTER PAR MEL après vérification].",
      umami:
        "Umami : mesure d'audience, chargée uniquement après le consentement du visiteur. Hébergement (service en ligne ou serveur autogéré) : [À COMPLÉTER PAR MEL].",
    },
    retention: {
      lead: "Demande de rendez-vous sans suite : [À COMPLÉTER PAR MEL : durée à décider]",
      client: "Contact devenu client : [À COMPLÉTER PAR MEL : durée à décider]",
      logs: "Journaux d'hébergement : [À COMPLÉTER PAR MEL : durée à décider]",
      consent: "Preuve de consentement : [À COMPLÉTER PAR MEL : durée à décider]",
    },
    rights: {
      list: "Toute personne peut demander l'accès à ses données, leur rectification, leur effacement, la limitation ou l'opposition à leur traitement, et leur portabilité. Lorsque le traitement repose sur le consentement, celui-ci peut être retiré à tout moment, sans remettre en cause les traitements déjà réalisés.",
      how: "Les demandes s'adressent à Softn.io via le formulaire de contact : {contactPageLink}, en choisissant l'objet « {dataRequestSubject} ». Une réponse est apportée dans un délai d'un mois.",
      complaint:
        "Toute personne peut également saisir la CNIL (cnil.fr) si elle estime que ses droits ne sont pas respectés.",
    },
    security: {
      body: "Les données de rendez-vous sont envoyées depuis le serveur du site, jamais depuis le navigateur vers un service tiers. Les accès aux outils sont protégés. Aucune donnée personnelle n'est placée dans les journaux ni dans les mesures d'audience. [À CONFIRMER PAR security avant publication.]",
    },
    ai: {
      body: "L'assistant virtuel du site fonctionne dans un périmètre défini et ne prend aucune décision concernant les personnes. Les informations saisies ne servent pas à entraîner un modèle d'intelligence artificielle. [À CONFIRMER PAR chatbot-dev : vrai tant que les réponses de l'assistant restent encadrées par le périmètre défini.]",
    },
    changes: {
      body: "Cette page peut évoluer. La date de dernière mise à jour figure en haut.",
    },
  },
  cookies: {
    title: "Politique de cookies",
    updated: "Dernière mise à jour : [À COMPLÉTER PAR MEL : date]",
    intro:
      "Un cookie est un petit fichier enregistré sur l'appareil lors de la visite d'un site. Cette page recense les cookies utilisés par softn.io et explique comment gérer son choix.",
    sections: {
      necessary: {
        title: "Cookies strictement nécessaires",
      },
      audience: {
        title: "Mesure d'audience",
      },
      thirdParty: {
        title: "Services tiers",
      },
      choice: {
        title: "Gestion du choix",
      },
      browser: {
        title: "Paramètres du navigateur",
      },
    },
    necessary: {
      body: "Ils sont indispensables au fonctionnement du site et ne requièrent pas de consentement : mémorisation du choix de cookies et, lorsque le visiteur en choisit un, du thème d'affichage (clair ou sombre). [À CONFIRMER PAR nextjs-dev : liste exacte des clés stockées.]",
    },
    audience: {
      body: "Avec le consentement du visiteur, le site utilise Umami pour compter les visites et comprendre quelles parties du site sont consultées. Rien n'est chargé avant ce consentement. [À CONFIRMER PAR MEL : version d'Umami, cookies éventuellement déposés.]",
    },
    thirdParty: {
      body: "La réservation d'un créneau repose sur un service tiers (Fillout, avec Google Calendar), chargé uniquement après consentement, au moment de la réservation. En cas de refus, ce service n'est pas chargé et la réservation ne peut pas être finalisée.",
    },
    choice: {
      body: "Lors de la première visite, un bandeau propose d'accepter ou de refuser les cookies non nécessaires. Refuser est aussi simple qu'accepter. Le choix peut être modifié à tout moment avec le lien « Gérer mes cookies », en bas de chaque page.",
      duration:
        "Le choix est conservé pendant [À COMPLÉTER PAR MEL : durée, la CNIL recommande 6 mois].",
    },
    browser: {
      body: "Les cookies peuvent aussi être supprimés ou bloqués depuis les paramètres du navigateur. Certaines fonctionnalités du site peuvent alors être limitées.",
    },
  },
} as const

export type Legal = typeof legal

/** Cookie consent banner copy. Accept and decline buttons carry the same visual weight. */
export const cookieBanner = {
  ariaLabel: "Choix des cookies",
  title: "Choix des cookies",
  body: "Ce site mesure son audience uniquement avec votre accord, afin de s'améliorer. La réservation d'un échange fait aussi appel à un service tiers. Aucun cookie non nécessaire n'est déposé avant votre consentement.",
  accept: "Tout accepter",
  decline: "Tout refuser",
  customize: "Personnaliser",
  learnMore: "Politique de cookies",
  saved: "Votre choix est enregistré.",
} as const

export type CookieBanner = typeof cookieBanner
