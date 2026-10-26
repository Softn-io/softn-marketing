import { interpolate } from '@/lib/interpolate'
import { agent } from '@/locales/fr/agent'
import { ASSISTANT_NAME, chatbot } from '@/locales/fr/chatbot'

/** Values every agent message template is filled with. */
export const AGENT_INTERPOLATION_VALUES = { assistantName: ASSISTANT_NAME } as const

/** Speakers of the agent conversation: the assistant answers, the visitor asks. */
export const AGENT_SPEAKERS = {
  assistant: 'assistant',
  visitor: 'visitor',
} as const

/** One speaker of the agent conversation. */
export type AgentSpeaker = (typeof AGENT_SPEAKERS)[keyof typeof AGENT_SPEAKERS]

/** One message of the conversation, as held before grouping. */
export type AgentMessage = {
  /** Who wrote the message. */
  speaker: AgentSpeaker
  /** Locale template of the text, holding `{assistantName}` for the assistant. */
  template: string
}

/** Welcome messages the shell shows before any conversation starts, in render order. */
export const AGENT_WELCOME_MESSAGES: readonly AgentMessage[] = [
  { speaker: AGENT_SPEAKERS.assistant, template: chatbot.welcome.first },
  { speaker: AGENT_SPEAKERS.assistant, template: chatbot.welcome.prompt },
]

/** Consecutive messages of one speaker, rendered under a single speaker line. */
export type AgentMessageGroup = {
  /** Speaker shared by every message of the group. */
  speaker: AgentSpeaker
  /** Message templates of the group, in render order. */
  templates: readonly string[]
}

/** Accumulator of {@link groupMessagesBySpeaker}: a group grows as long as its speaker repeats. */
type GrowingMessageGroup = { speaker: AgentSpeaker; templates: string[] }

/**
 * Groups consecutive messages by speaker, so a speaker line renders once above its run of messages
 * while the order of the conversation stays intact.
 *
 * @param messages Messages in render order.
 * @returns One group per run of consecutive messages from the same speaker.
 */
export const groupMessagesBySpeaker = (messages: readonly AgentMessage[]): readonly AgentMessageGroup[] =>
  messages.reduce<GrowingMessageGroup[]>((groups, message) => {
    const current = groups[groups.length - 1]
    if (current !== undefined && current.speaker === message.speaker) {
      current.templates.push(message.template)
      return groups
    }
    groups.push({ speaker: message.speaker, templates: [message.template] })
    return groups
  }, [])

/** Speaker line of each speaker, as written in the locale. */
const SPEAKER_TEMPLATES: Readonly<Record<AgentSpeaker, string>> = {
  [AGENT_SPEAKERS.assistant]: agent.speaker.assistant,
  [AGENT_SPEAKERS.visitor]: agent.speaker.visitor,
}

/**
 * Speaker line of a conversation speaker, with the assistant name filled in.
 *
 * @param speaker Speaker of the message group.
 * @returns The label rendered once above that speaker's consecutive messages.
 */
export const agentSpeakerLabel = (speaker: AgentSpeaker): string =>
  interpolate(SPEAKER_TEMPLATES[speaker], AGENT_INTERPOLATION_VALUES)

/**
 * Fills a locale template with the assistant name.
 *
 * @param template Locale string, optionally holding `{assistantName}`.
 * @returns The string ready to render.
 */
export const withAssistantName = (template: string): string => interpolate(template, AGENT_INTERPOLATION_VALUES)
