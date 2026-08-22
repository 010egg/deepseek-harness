import { createInterface } from 'node:readline/promises'
import { AgentLoop } from './agent/loop.ts'
import { DeepSeekProvider } from './capabilities/llm/deepseek-provider.ts'
import { Context } from './cordis/lib/index.js'
import { SessionLog } from './session/log.ts'

/** Print the reconstructed message list for a persisted session log and exit. */
async function replay(filePath: string): Promise<void> {
  const log = await SessionLog.replay(filePath)
  for (const message of log.toMessages()) {
    console.log(`[${message.role}] ${message.content}`)
  }
}

/** Start an interactive REPL backed by a fresh Cordis app and session log. */
async function repl(logPath: string): Promise<void> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    console.error('DEEPSEEK_API_KEY is not set.')
    process.exitCode = 1
    return
  }

  const log = new SessionLog(logPath)
  const root = new Context()
  await root.plugin(DeepSeekProvider, {
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL,
    model: process.env.DEEPSEEK_MODEL,
  })
  await root.plugin(AgentLoop, log)

  console.log(`session log: ${logPath}`)
  console.log('type a message, or /exit to quit')

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    for (;;) {
      const line = await rl.question('> ')
      if (!line.trim()) continue
      if (line.trim() === '/exit') break
      const reply = await root.agent.turn(line)
      console.log(reply)
    }
  } finally {
    rl.close()
    await root.fiber.dispose()
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const replayIndex = args.indexOf('--replay')
  if (replayIndex >= 0) {
    const filePath = args[replayIndex + 1]
    if (!filePath) throw new Error('--replay requires a session log file path')
    await replay(filePath)
    return
  }

  const logIndex = args.indexOf('--log')
  const logPath = (logIndex >= 0 ? args[logIndex + 1] : undefined) ?? `data/session-${Date.now()}.jsonl`
  await repl(logPath)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
