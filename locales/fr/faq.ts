/** FAQ section copy. The same texts feed the FAQPage structured data. */
export const faq = {
  title: "Questions fréquentes",
  items: [
    {
      question: "L'IA, est-ce fiable ?",
      answer:
        "Les agents accélèrent, mais je relis et je valide chaque livrable. Vous obtenez la vitesse de l'IA avec la rigueur d'un développement suivi. Et si une tâche ne peut pas être confiée à l'IA, je vous le dis.",
    },
    {
      question: "Je ne suis pas technique : est-ce pour moi ?",
      answer:
        "Oui. J'explique chaque étape simplement, je prends toute la partie technique en charge et je vous accompagne dans la prise en main, avec une documentation claire et un suivi, pour que vous puissiez utiliser votre outil en confiance.",
    },
    {
      question: "Combien ça coûte ?",
      answer:
        "Chaque projet est chiffré après notre échange, selon son ampleur. Le plan d'action, lui, est offert.",
    },
    {
      question: "Le code et les automatisations m'appartiennent-ils ?",
      answer:
        "Oui. Le code de votre site ou de votre application, et les automatisations mises en place pour vous, vous appartiennent. Les modalités précises, dont le moment du transfert, sont fixées dans le devis avant le début du projet.",
    },
    {
      question: "Que se passe-t-il pendant l'échange Spark ?",
      answer:
        "Vous décrivez votre situation et votre projet : création d'un site ou d'une application, tâches à automatiser. Je vous indique ce qui est réalisable et par où commencer. Vous recevez ensuite votre plan d'action sous 3 jours, même si nous n'allons pas plus loin.",
    },
    {
      question: "Quels outils utilisez-vous ?",
      answer:
        "Je m'adapte à vos outils et à vos besoins, plutôt que l'inverse. Selon le projet, j'utilise des outils d'automatisation et des assistants IA, ainsi que des outils de développement assistés par l'IA pour construire des sites et des applications. Le choix reste flexible.",
    },
    {
      question: "Travaillez-vous avec des clients partout en France ?",
      answer:
        "Oui. Je peux travailler entièrement à distance, par visioconférence, avec des clients partout en France.",
    },
    {
      question: "Que se passe-t-il si une automatisation rencontre un problème ?",
      answer:
        "Chaque automatisation est dotée d'un garde-fou et d'une alerte en cas d'échec, qui vous prévient. Vous pouvez la consulter, la relancer ou l'arrêter, et un accompagnement reste disponible si besoin.",
    },
  ],
} as const

export type Faq = typeof faq
