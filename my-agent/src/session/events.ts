/**
 * Discriminated union of every event that can appear in a {@link SessionLog}.
 *
 * This is the complete alphabet of model-visible input: the agent loop is
 * only allowed to build an LLM request by reading events back out of the
 * log (see `SessionLog.toMessages`), never from ad hoc in-memory state. A
 * new kind of model-visible input therefore always starts here.
 */
export type SessionEvent =
  | UserMessageEvent
  | AssistantMessageEvent

interface BaseEvent {
  /** ISO-8601 timestamp assigned when the event was appended to the log. */
  at: string
}

export interface UserMessageEvent extends BaseEvent {
  type: 'user_message'
  content: string
}

export interface AssistantMessageEvent extends BaseEvent {
  type: 'assistant_message'
  content: string
}

/** Exhaustiveness helper for `switch (event.type)` over {@link SessionEvent}. */
export function assertNeverEvent(event: never): never {
  throw new Error(`unhandled session event type: ${(event as SessionEvent).type}`)
}
