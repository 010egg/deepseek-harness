import { Service } from '../../cordis/lib/index.js'
import type { Context } from '../../cordis/lib/index.js'
import type { ChatMessage, ChatResult, LLMService } from './service.ts'

/** Deployment-varying knobs for {@link DeepSeekProvider}; not hardcoded. */
export interface DeepSeekProviderConfig {
  apiKey: string
  baseURL?: string
  model?: string
}

const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-chat'

/**
 * Service Provider of the LLM capability seam: implements {@link LLMService}
 * against DeepSeek's OpenAI-compatible chat completions endpoint.
 *
 * Registers itself as `ctx.llm` via the `Service` base class. A second
 * provider (a different model vendor, a mock for tests) can register under
 * the same name without any consumer code changing, because consumers only
 * ever depend on the `LLMService` interface.
 */
export class DeepSeekProvider extends Service implements LLMService {
  constructor(ctx: Context, private readonly config: DeepSeekProviderConfig) {
    super(ctx, 'llm')
  }

  async chat(messages: ChatMessage[]): Promise<ChatResult> {
    const baseURL = this.config.baseURL ?? DEFAULT_BASE_URL
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model ?? DEFAULT_MODEL,
        messages,
      }),
    })
    if (!response.ok) {
      throw new Error(`DeepSeek API error ${response.status}: ${await response.text()}`)
    }
    const body = await response.json() as { choices: { message: { content: string } }[] }
    const choice = body.choices[0]
    if (!choice) throw new Error('DeepSeek API response had no choices')
    return { content: choice.message.content }
  }
}
