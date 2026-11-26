/**
 * Legal pages copy: legal notice, privacy policy and cookie policy.
 *
 * Parameters in braces (`{contactPageLink}`, `{dataRequestSubject}`, `{date}`) are filled at render
 * time. `\n` marks a line break inside one block — the pages render it as a line break, never as raw
 * HTML. The consent banner copy lives in `cookieBanner` below, separate from the pages.
 */
export const legal = {
  mentions: {
    title: 'Mentions légales',
    updated: 'Dernière mise à jour : {date}',
    sections: {
      publisher: {
        title: 'Éditeur du site',
        body: 'Le site softn.io est édité par Mélanie CHARBONNÉ - Softn.io.\nStatut : Entrepreneur individuel',
      },
      director: {
        title: 'Directrice de la publication',
        body: 'Mélanie CHARBONNÉ',
      },
      host: {
        title: 'Hébergeur',
        body: "Le site est hébergé par Vercel Inc., 440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis. Les fonctions du site s'exécutent à Paris (France). Informations de contact : https://vercel.com/legal/privacy-policy.",
      },
      ip: {
        title: 'Propriété intellectuelle',
        body: "Les textes, l'identité visuelle et les éléments graphiques de ce site sont la propriété de l'éditeur, sauf mention contraire. Toute reproduction sans autorisation écrite est interdite. Les polices Plus Jakarta Sans et Zalando Sans (version modifiée et renommée Softn Display) sont diffusées sous la licence SIL Open Font License 1.1. Les icônes proviennent de la bibliothèque Lucide, diffusée sous la licence ISC.",
      },
      data: {
        title: 'Données personnelles et cookies',
        body: 'Le traitement des données personnelles est décrit dans la politique de confidentialité et la politique de cookies.',
      },
    },
    publisher: {
      siret: 'SIRET : 52815721700043',
      vat: 'TVA intracommunautaire : non applicable',
      address: 'Adresse : 231 rue Saint-Honoré, 75001 Paris',
      contact: 'Contact : {contactPageLink}',
    },
  },
  privacy: {
    title: 'Politique de confidentialité',
    updated: 'Dernière mise à jour : {date}',
    intro:
      "Cette page présente les données personnelles collectées sur softn.io, leurs finalités, leur durée de conservation et les modalités d'exercice des droits des personnes concernées.",
    sections: {
      controller: {
        title: 'Responsable du traitement',
        body: 'Le responsable du traitement est Mélanie CHARBONNÉ, entrepreneur individuel, exerçant sous le nom Softn.io.\nContact : {contactPageLink}.',
      },
      collected: {
        title: 'Données collectées',
        intro: "Selon l'utilisation du site, les données suivantes peuvent être traitées :",
      },
      purposes: {
        title: 'Finalités et bases légales',
      },
      processors: {
        title: 'Destinataires des données',
      },
      transfers: {
        title: "Transferts hors de l'Union européenne",
        body: "Les données sont principalement hébergées dans l'Union européenne. Certains prestataires sont établis hors de l'Union européenne (États-Unis) : Upstash, Vercel, Umami (hébergé sur Vercel), Google et Supabase. Le transfert est alors encadré par le Data Privacy Framework (UE–États-Unis) pour les entreprises certifiées ou par des clauses contractuelles types. Baserow est un prestataire européen, sans transfert hors de l'Union européenne. Mistral AI est un prestataire européen, sans transfert hors de l'Espace économique européen, à l'exception éventuelle de la Suisse, qui bénéficie d'une décision d'adéquation de la Commission européenne.",
      },
      retention: {
        title: 'Durées de conservation',
      },
      rights: {
        title: 'Droits des personnes',
      },
      security: {
        title: 'Sécurité des données',
      },
      ai: {
        title: 'Assistant virtuel',
      },
      emails: {
        title: 'E-mails de service',
      },
      changes: {
        title: 'Modifications',
      },
    },
    collected: {
      booking:
        "Lors d'une prise de rendez-vous avec l'assistant : prénom, nom, adresse e-mail, téléphone (facultatif), type de structure (facultatif), fonction (facultatif), description du besoin, créneau choisi et son statut, motif d'annulation (facultatif), et trace du consentement (case cochée et date).",
      call: "Lors de l'échange en visioconférence : une transcription de ce qui est dit pendant l'appel, et un résumé, produits par l'outil Gemini de Google Workspace. L'échange n'est pas enregistré (ni vidéo, ni son).",
      contact:
        "Lors de l'envoi d'un message via le formulaire de contact : prénom, nom, adresse e-mail, objet et contenu du message, et trace du consentement (case cochée et date). Finalité : répondre au message.",
      waitlist:
        "Lors de l'inscription à la liste d'attente de lancement : adresse e-mail. Finalité : envoyer un seul e-mail, à l'ouverture du site.",
      technical:
        "À chaque visite : adresse IP et données techniques nécessaires au fonctionnement et à la sécurité du site (journaux d'hébergement). Pour limiter les abus, une version pseudonymisée de l'adresse IP et un compteur de requêtes sont conservés quelques minutes.",
      audience:
        "Avec le consentement du visiteur : statistiques de navigation (pages consultées, type d'appareil et de navigateur) et, pour une partie des visites, données d'interaction : clics, défilement, mouvements de la souris et contenu de la page, enregistrés sous forme de cartes de chaleur et de replays. Les textes et les champs de saisie sont masqués ; l'assistant, la réservation et le formulaire de contact ne sont pas enregistrés. Ces mesures ne sont actives qu'après l'accord du visiteur.",
    },
    purposes: {
      booking:
        "Organiser l'échange découverte, envoyer les e-mails de service liés au rendez-vous (confirmation, mise à jour, annulation et rappel), préparer le plan d'action, et permettre à la personne de déplacer ou d'annuler son rendez-vous, le créneau et le statut de la demande étant alors mis à jour. Base légale : consentement de la personne, recueilli avant toute saisie dans l'assistant.",
      call: "Préparer le plan d'action remis à la suite de l'échange découverte : la transcription et le résumé ne servent qu'à cela. Base légale : intérêt légitime (préparer le plan d'action demandé par la personne). La personne en est informée par écrit dans les e-mails de réservation (confirmation, mise à jour et rappel), puis au début de l'échange. Elle peut demander que la transcription soit désactivée, en répondant à l'un de ces e-mails ou à l'oral : elle exerce alors son droit d'opposition.",
      contact:
        'Répondre aux messages envoyés par le formulaire de contact. Base légale : consentement de la personne, recueilli par la case à cocher du formulaire.',
      waitlist:
        "Prévenir la personne de l'ouverture du site. Base légale : consentement, exprimé par l'envoi du formulaire.",
      technical:
        'Assurer le fonctionnement et la sécurité du site, y compris la limitation des abus (limitation du débit, vérification anti-robot). Base légale : intérêt légitime.',
      audience:
        "Mesurer l'audience du site et comprendre comment il est utilisé (pages vues, zones cliquées, parcours) afin de l'améliorer. Base légale : consentement, recueilli par le bandeau de cookies, qui couvre à la fois les statistiques, les cartes de chaleur et les replays.",
    },
    processors: {
      intro:
        'Softn.io fait appel à des prestataires (sous-traitants) pour faire fonctionner le site. Ils traitent les données pour son compte :',
      baserow:
        "Baserow : enregistrement des demandes de rendez-vous, des messages du formulaire de contact et des adresses de la liste d'attente. Service hébergé en Allemagne (Union européenne), par une société établie aux Pays-Bas. Aucun transfert hors de l'Union européenne.",
      mistral:
        "Mistral AI : génération des réponses de l'assistant virtuel. Service utilisé via l'interface européenne de Mistral AI ; le calcul est effectué dans des centres de données situés dans l'Union européenne et dans des pays de l'AELE. Aucun transfert hors de l'Espace économique européen, à l'exception éventuelle de la Suisse, qui bénéficie d'une décision d'adéquation de la Commission européenne.",
      upstash:
        "Upstash : limitation du nombre de requêtes de l'assistant, de la réservation et du formulaire de contact, et mémorisation à usage unique de la vérification anti-robot du formulaire de contact. Base de données hébergée à Francfort (Union européenne), par Upstash Inc. (États-Unis) ; transfert encadré par le Data Privacy Framework (UE–États-Unis).",
      google:
        "Google Calendar et Gmail (Google Workspace) : agenda des rendez-vous et envoi des e-mails de service (confirmation, mise à jour, annulation, rappel, et e-mails liés au formulaire de contact). Données hébergées dans l'Union européenne (paramètre de localisation des données de Google Workspace) ; transferts encadrés par des clauses contractuelles types.",
      meet: "Google Meet : visioconférence de l'échange. L'échange n'est pas enregistré : Google ne conserve ni la vidéo, ni le son, ni la messagerie d'une réunion que personne n'enregistre, et n'utilise pas ces données à des fins publicitaires. Une transcription et un résumé sont produits par Gemini (Google Workspace). Ils ne servent qu'à préparer le plan d'action, restent dans l'espace Google Workspace de Softn.io, sont stockés dans l'Union européenne (région de données choisie dans Google Workspace) et ne sont pas utilisés pour entraîner des modèles. Le lien de la visioconférence et le traitement en direct de l'appel peuvent avoir lieu hors de l'Union européenne, dans le cadre des clauses contractuelles types de Google.",
      vercel:
        "Vercel : hébergement du site et journaux techniques. Les fonctions du site s'exécutent à Paris (France) ; Vercel Inc. est établie aux États-Unis ; transfert encadré par le Data Privacy Framework (UE–États-Unis).",
      umami:
        "Umami : mesure d'audience, cartes de chaleur et replays de sessions, chargés uniquement après le consentement du visiteur. Application hébergée sur Vercel (fonctions à Paris) ; transfert encadré par le Data Privacy Framework (UE–États-Unis).",
      supabase:
        "Supabase : stockage des statistiques, des cartes de chaleur et des replays de la mesure d'audience Umami, après consentement du visiteur. Données hébergées en Irlande (Union européenne) ; transfert encadré par les clauses contractuelles types de la Commission européenne.",
    },
    retention: {
      lead: 'Demande de rendez-vous sans suite ou annulée : 365 jours.',
      client: 'Contact devenu client : 365 jours après la fin du contrat.',
      call: "Transcription et résumé de l'échange : 365 jours après l'échange ou, si une mission est engagée, pendant toute la durée du contrat.",
      contactMessage: 'Message envoyé par le formulaire de contact : 365 jours sans suite donnée.',
      waitlist:
        "Adresse de la liste d'attente : 365 jours sans suite donnée.\nLa suppression est possible sur simple demande.",
      logs: "Journaux d'hébergement : durée de conservation prévue par Vercel pour l'offre utilisée, sans export.",
      rateLimit:
        "Données de limitation du débit : 60 secondes pour l'assistant et 10 minutes pour le formulaire de contact. Identifiants de la vérification anti-robot : 10 minutes.",
      audienceReplays: 'Replays de sessions : 30 jours, puis suppression. Un replay dure 5 minutes au plus.',
      audienceStats: 'Statistiques et cartes de chaleur agrégées : 24 mois, puis suppression.',
      consent: 'Preuve de consentement : 365 jours sans suite donnée.',
    },
    rights: {
      list: "Toute personne peut demander l'accès à ses données, leur rectification, leur effacement, la limitation ou l'opposition à leur traitement, et leur portabilité. Lorsque le traitement repose sur le consentement, celui-ci peut être retiré à tout moment, sans remettre en cause les traitements déjà réalisés.",
      how: "Les demandes s'adressent au responsable du traitement via le formulaire de contact : {contactPageLink}, en choisissant l'objet « {dataRequestSubject} ». Une réponse est apportée dans un délai d'un mois.",
      complaint:
        'Toute personne peut également saisir la CNIL (cnil.fr) si elle estime que ses droits ne sont pas respectés.',
    },
    security: {
      body: "Les données de rendez-vous et de contact sont envoyées depuis le serveur du site, jamais depuis le navigateur vers un service tiers. Les accès aux outils sont protégés. Aucune donnée personnelle n'est placée dans les journaux. Les enregistrements d'audience masquent tous les textes et tous les champs de saisie, et excluent l'assistant, la réservation et le formulaire de contact.",
    },
    ai: {
      body: "L'assistant virtuel du site se présente comme tel dès son premier message. Il fonctionne dans un périmètre défini et ne prend aucune décision concernant les personnes. Pour générer ses réponses, il envoie les questions du visiteur, ainsi que l'historique de la conversation en cours, à Mistral AI, qui agit en qualité de sous-traitant. Aucun compte n'est créé et Softn.io ne conserve pas ces échanges. Il est demandé de ne pas saisir de données personnelles dans les questions. Les informations de réservation (nom, adresse e-mail, besoin) ne sont jamais transmises à Mistral AI. Les informations saisies ne servent pas à entraîner un modèle d'intelligence artificielle.",
    },
    emails: {
      body: "Après une réservation, un déplacement ou une annulation, ainsi qu'environ 24 heures avant l'échange, Softn.io envoie un e-mail de service : confirmation, mise à jour, annulation ou rappel. Ces messages sont envoyés avec Gmail (Google Workspace) et ne servent qu'à organiser l'échange. Les données utilisées sont le prénom, l'adresse e-mail, le créneau choisi et les liens de connexion et de gestion du rendez-vous. Elles ne servent jamais à de la prospection ni à l'envoi de lettres d'information. Le message comporte un fichier d'agenda (hors rappel), sans suivi d'ouverture ni de clic. Une réponse à l'un de ces messages est lue dans la boîte de réception de Softn.io. Les messages du formulaire de contact donnent lieu à une notification à l'éditeur et à une réponse automatique à l'expéditeur, envoyées de la même façon. Chaque réservation, déplacement ou annulation donne aussi lieu à une notification interne, envoyée à Softn.io avec les informations saisies lors de la réservation (nom, adresse e-mail, besoin, et, le cas échéant, téléphone, structure, fonction et motif d'annulation). Cette notification reste dans la boîte de réception de Softn.io.",
    },
    changes: {
      body: 'Cette page peut évoluer. La date de dernière mise à jour figure en haut.',
    },
  },
  cookies: {
    title: 'Politique de cookies',
    updated: 'Dernière mise à jour : {date}',
    intro:
      "Un cookie est un petit fichier enregistré sur l'appareil lors de la visite d'un site. Cette page recense les cookies utilisés par softn.io et explique comment gérer son choix.",
    sections: {
      necessary: {
        title: 'Cookies strictement nécessaires',
      },
      audience: {
        title: "Mesure d'audience",
      },
      thirdParty: {
        title: 'Services tiers',
      },
      choice: {
        title: 'Gestion du choix',
      },
      browser: {
        title: 'Paramètres du navigateur',
      },
    },
    necessary: {
      body: "Le site ne dépose aucun cookie nécessaire à son fonctionnement. Lorsque le visiteur choisit explicitement un thème d'affichage (clair ou sombre), ce choix est mémorisé dans le navigateur (stockage local, clé « softn-theme »), sans cookie, et n'est jamais transmis au serveur. Cette mémorisation répond à un choix du visiteur et ne requiert pas de consentement. Le choix de cookies du visiteur est lui aussi mémorisé dans son navigateur (stockage local, sans cookie), pour ne pas le solliciter à chaque page.",
    },
    audience: {
      body: "Avec le consentement du visiteur, le site utilise Umami pour mesurer son audience. Rien n'est chargé avant ce consentement. Deux scripts sont alors chargés depuis softn.io, sans cookie.",
      tracker:
        'Le premier compte les visites et les pages consultées, pour comprendre quelles parties du site sont lues.',
      heatmaps:
        'Le second produit des cartes de chaleur : les clics et la profondeur de défilement sont regroupés par page, pour repérer ce qui est cliqué ou ignoré.',
      replays:
        "Il permet aussi d'enregistrer une partie des visites sous forme de replay : une reconstitution du parcours sur la page (mouvements de la souris, clics, défilement, contenu de la page), pour repérer ce qui gêne la navigation. Un replay s'arrête automatiquement au bout de 5 minutes au plus.",
      masking:
        "L'enregistrement est configuré avec un masquage strict : tous les champs de saisie et tous les textes de la page sont masqués. L'assistant virtuel, la réservation et le formulaire de contact sont entièrement exclus de l'enregistrement.",
      retention: 'Les replays sont conservés 30 jours par Umami, puis supprimés.',
    },
    thirdParty: {
      body: "La réservation d'un échange et le formulaire de contact fonctionnent sans service tiers chargé dans le navigateur : les informations transitent par le serveur du site, et la vérification anti-robot du formulaire de contact s'effectue dans le navigateur, sans cookie. Les prestataires concernés sont listés dans la politique de confidentialité.",
    },
    choice: {
      body: "Les cookies et dispositifs de mesure non nécessaires ne sont activés qu'avec l'accord du visiteur, recueilli par un bandeau affiché lors de la première visite. Refuser est aussi simple qu'accepter. Le choix peut être modifié ou retiré à tout moment depuis le lien « Gérer mes cookies », en bas de chaque page.",
      withdrawal:
        "Si vous désactivez la mesure d'audience, elle s'arrête au plus tard au chargement de la page suivante.",
      duration:
        'Le choix est conservé pendant 6 mois dans le navigateur utilisé, puis le bandeau est de nouveau affiché. Il ne concerne que cet appareil et ce navigateur.',
    },
    browser: {
      body: 'Les cookies peuvent aussi être supprimés ou bloqués depuis les paramètres du navigateur. Certaines fonctionnalités du site peuvent alors être limitées.',
    },
  },
} as const

export type Legal = typeof legal

/** Cookie consent banner copy. Accept and decline buttons carry the same visual weight. */
export const cookieBanner = {
  ariaLabel: 'Choix des cookies',
  title: 'Votre vie privée, votre choix',
  body: "Ce site peut mesurer son audience afin de s'améliorer, uniquement avec votre accord.\nIl ne dépose aucun cookie.",
  accept: 'Tout accepter',
  decline: 'Tout refuser',
  customize: 'Personnaliser',
  learnMore: 'Politique de cookies',
  saved: 'Votre choix est enregistré.',
  preferences: {
    title: 'Gérer mes cookies',
    closeAriaLabel: 'Fermer la fenêtre de gestion des cookies',
    intro:
      'Choisissez ce que ce site peut mémoriser et mesurer. Il ne dépose aucun cookie : votre choix est conservé dans votre navigateur et vous pouvez le modifier à tout moment.',
    necessary: {
      title: 'Stockage strictement nécessaire',
      status: 'Toujours actif',
      description:
        "Mémorise dans votre navigateur le thème d'affichage que vous choisissez et votre choix sur cette page. Aucun cookie, rien n'est transmis à un tiers.",
    },
    audience: {
      title: "Mesure d'audience",
      description:
        "Avec l'outil Umami : compte les visites et les pages consultées, cartographie les clics et le défilement. Une partie des visites est enregistrée sous forme de replay (les textes et les champs de saisie sont masqués). Rien n'est chargé sans votre accord. Aucun cookie n'est utilisé.",
      toggleAriaLabel: "Autoriser la mesure d'audience",
      stateOn: 'Activée',
      stateOff: 'Désactivée',
    },
    retention: 'Votre choix est conservé 6 mois dans ce navigateur.',
    save: 'Enregistrer mes choix',
  },
} as const

export type CookieBanner = typeof cookieBanner
