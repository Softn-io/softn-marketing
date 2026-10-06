import { common } from "./hero"

/** Assistant presentation section copy (`#agent`). */
export const agent = {
  eyebrow: "{assistantName}, assistant virtuel IA de Softn.io",
  title: "Posez votre question à {assistantName}, puis réservez votre échange.",
  speaker: {
    assistant: "{assistantName}, assistant IA",
    visitor: "Vous",
  },
  inputLabel: "Votre question",
  inputPlaceholder: "Écrivez votre question…",
  sendLabel: "Envoyer",
  bookCta: common.cta.book,
  cancelBooking: "Annuler la prise de rendez-vous",
  restart: "Recommencer",
  scopeNote:
    "{assistantName} répond aux questions sur les services et la méthode de Softn.io. Hors de ce périmètre, {assistantName} propose de réserver un échange.",
} as const

export type Agent = typeof agent
