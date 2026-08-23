import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ChatMessage } from '../capabilities/llm/service.ts'
import { assertNeverEvent, type SessionEvent } from './events.ts'

/**
 * On-disk record format version. Bump this on any change to the shape of
 * {@link SessionEvent} or the JSONL envelope below; there is no compatibility
 * promise across versions in this skeleton.
 */
export const SESSION_FORMAT_VERSION = 0

interface PersistedRecord {
  v: typeof SESSION_FORMAT_VERSION
  event: SessionEvent
}

/**
 * Append-only log of every model-visible event in a session.
 *
 * This is the mechanism behind the "model-visible ⟺ logged" invariant:
 * {@link SessionLog.toMessages} is the *only* path the agent loop uses to
 * build an LLM request, and it derives that request purely by folding over
 * `events`. There is no parallel mutable "current conversation" object for
 * it to drift from the log — the log is the conversation. Optionally
 * persists each appended event as one JSON line to `filePath`, so a session
 * can be reconstructed from disk by {@link SessionLog.replay} alone.
 */
export class SessionLog {
  private readonly events: SessionEvent[] = []

  constructor(private readonly filePath?: string) {}

  /** Read-only view of every event appended so far, in append order. */
  list(): readonly SessionEvent[] {
    return this.events
  }

  /**
   * Append one event to the in-memory log and, if a file path was given,
   * persist it as one JSON line.
   *
   * @param event — the event to record.
   */
  async append(event: SessionEvent): Promise<void> {
    this.events.push(event)
    if (!this.filePath) return
    await mkdir(dirname(this.filePath), { recursive: true })
    const record: PersistedRecord = { v: SESSION_FORMAT_VERSION, event }
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, 'utf8')
  }

  /**
   * Reconstruct the LLM-ready message list from the logged events. This is
   * the one place event history becomes a chat request, so any event kind
   * the model needs to see must be handled here.
   *
   * @returns messages in the order the model should see them.
   */
  toMessages(): ChatMessage[] {
    const messages: ChatMessage[] = []
    for (const event of this.events) {
      switch (event.type) {
        case 'user_message':
          messages.push({ role: 'user', content: event.content })
          break
        case 'assistant_message':
          messages.push({ role: 'assistant', content: event.content })
          break
        default:
          assertNeverEvent(event)
      }
    }
    return messages
  }

  /**
   * Load a session log previously persisted by {@link SessionLog.append},
   * proving the log is reconstructable from disk alone.
   *
   * @param filePath — JSONL file previously written by an instance with the
   *   same path.
   * @returns a new `SessionLog` whose `events` replay the file's contents.
   */
  static async replay(filePath: string): Promise<SessionLog> {
    const log = new SessionLog(filePath)
    let raw: string
    try {
      raw = await readFile(filePath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return log
      throw error
    }
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue
      const record = JSON.parse(line) as PersistedRecord
      if (record.v !== SESSION_FORMAT_VERSION) {
        throw new Error(`session log ${filePath} has format version ${record.v}, expected ${SESSION_FORMAT_VERSION}`)
      }
      log.events.push(record.event)
    }
    return log
  }
}
