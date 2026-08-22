import { Service } from '../cordis/lib/index.js'
import type { Context } from '../cordis/lib/index.js'
import type { SessionLog } from '../session/log.ts'

declare module '../cordis/lib/index.js' {
  interface Context {
    agent: AgentLoop
  }
}

/**
 * Consumer of the LLM capability seam.
 *
 * Declares `inject: ['llm']`, so Cordis only activates this fiber once a
 * provider for `ctx.llm` is registered, and holds no reference to
 * `DeepSeekProvider` or any other concrete implementation. Every turn is
 * built strictly from the {@link SessionLog}: `turn()` appends the user
 * message, asks the log to reconstruct the message list, sends that to
 * `ctx.llm`, and appends the reply — there is no separate in-memory
 * conversation state the log could drift from.
 */
export class AgentLoop extends Service {
  static readonly inject = ['llm']

  constructor(ctx: Context, private readonly log: SessionLog) {
    super(ctx, 'agent')
  }

  /**
   * Run one user turn: log the input, call the model with the reconstructed
   * history, log and return the reply.
   *
   * @param userText — the user's message for this turn.
   * @returns the assistant's reply.
   */
  async turn(userText: string): Promise<string> {
    await this.log.append({ type: 'user_message', content: userText, at: new Date().toISOString() })
    const result = await this.ctx.llm.chat(this.log.toMessages())
    await this.log.append({ type: 'assistant_message', content: result.content, at: new Date().toISOString() })
    return result.content
  }
}
