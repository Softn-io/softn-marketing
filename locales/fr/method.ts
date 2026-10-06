import { nav } from "./hero"

/** Method section copy: header, review-loop diagram labels and the five steps. */
export const method = {
  eyebrow: nav.method,
  title: {
    part1: "Des agents IA rapides et rigoureux.",
    part2: "Un humain qui décide.",
  },
  intro:
    "Chaque livrable est relu et validé avant d'être livré. Ce qui ne passe pas la relecture retourne aux agents pour être corrigé.",
  loop: {
    label: "La boucle de relecture",
    lanes: {
      live: "Livraison",
      review: "Relecture humaine",
      agents: "Agents IA",
    },
    status: {
      producing: "Les agents IA produisent",
      rising: "Les livrables sont transmis à la relecture",
      failing: "Un livrable non conforme retourne aux agents pour correction",
      live: "Le livrable validé est livré",
    },
    ariaLabel:
      "Schéma du processus en trois étapes : les agents IA produisent les livrables, un humain les relit et les valide, puis ils sont livrés. Un livrable non conforme retourne aux agents pour correction. Le schéma se construit au fil du défilement.",
  },
  steps: [
    {
      label: "Cadrage",
      title: "Nous identifions le problème avant de proposer une solution",
      text: "Un premier échange pour comprendre votre métier, vos outils et ce qui vous prend du temps. Vous recevez ensuite un plan d'action que vous pouvez utiliser, avec ou sans mon accompagnement.",
    },
    {
      label: "Découpage",
      title:
        "Je découpe le travail en tâches, confiées à des agents IA quand elles s'y prêtent",
      text: "Chaque tâche est assez courte pour être relue simplement et efficacement. Ce découpage rend la relecture plus fiable et le suivi plus clair.",
    },
    {
      label: "Relecture",
      title: "Chaque livrable est validé, corrigé ou repris",
      text: "Rien n'est livré sans relecture. Les agents IA accélèrent la production, mais la validation reste humaine : c'est elle qui contribue à la qualité de ce que vous recevez.",
    },
    {
      label: "Livraison",
      title:
        "Vous testez la version en ligne et vous donnez votre avis et vos retours",
      text: "Les livraisons sont fréquentes, plutôt qu'un lancement unique en fin de projet. Chaque livraison vous permet de réagir et d'orienter la suite du projet.",
    },
    {
      label: "Prise en main",
      title: "Vous gagnez en autonomie, avec un accompagnement si besoin",
      text: "Je vous accompagne dans la prise en main, avec une documentation claire et un suivi. Vous pouvez ensuite piloter l'outil en autonomie ; un accompagnement reste disponible si besoin, et le suivi comme la gestion courante peuvent m'être confiés.",
    },
  ],
  stepCounter: "{current} / {total}",
} as const

export type Method = typeof method
