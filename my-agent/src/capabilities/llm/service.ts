export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatResult {
  content: string
}

/**
 * Service Definition of the LLM capability seam.
 *
 * This interface is the contract every Service Provider (e.g.
 * {@link ./deepseek-provider.ts}) must implement and every Consumer (the
 * agent loop) is allowed to depend on. Consumers never import a concrete
 * provider directly — they declare `inject: ['llm']` and call `ctx.llm`,
 * so swapping providers never touches consumer code.
 */
export interface LLMService {
  /**
   * Send a chat completion request.
   *
   * @param messages — full conversation, oldest first.
   * @returns the model's reply.
   */
  chat(messages: ChatMessage[]): Promise<ChatResult>
}

declare module '../../cordis/lib/index.js' {
  interface Context {
    llm: LLMService
  }
}
