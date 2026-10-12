// Turn folds: one Turn's process rows — its reasoning steps and Tool calls —
// collapse into a single summary row, so a settled transcript reads as answers
// with their evidence folded underneath instead of a wall of equal-weight
// steps. The Turn's closing Assistant step is never folded: it is the answer,
// and it stays where the reader expects it.
//
// Planning is a pure function of the Chat snapshot that also returns a
// signature, so the view can hold one stable value and skip re-rendering while
// a step streams (every fold's identity and summary text is in the signature).

import type { ChatSnapshot, ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import type { ChatNode } from '../contract/chat-nodes.ts'

/** Row count a process run needs before folding is worth a header. */
const MIN_FOLD_ROWS = 2

/** Activity family a folded Tool call is reported under. */
export type FoldActivity = 'search' | 'edit' | 'run' | 'delegate' | 'other'

/** One activity family's share of a fold's Tool calls. */
export interface FoldActivityCount {
  readonly activity: FoldActivity
  readonly count: number
}

/** A collapsible run of process rows belonging to one Turn. */
export interface TurnFold {
  /** Stable identity: one Turn owns at most one fold. */
  readonly id: string
  readonly turn: number
  /** Ordered Chat Node keys this fold owns, in flow order. */
  readonly keys: readonly string[]
  /** Folded Assistant step rows (reasoning/narration, never the Turn's answer). */
  readonly reasoning: number
  /** Leaf Tool calls by activity family, most frequent first. */
  readonly activities: readonly FoldActivityCount[]
  /** Turn wall time; null while the Turn is open or its boundary is out of window. */
  readonly durationMs: number | null
  readonly running: boolean
}

/** One rendered flow row: a plain Chat Node, or a whole Turn's process fold. */
export type ChatFlowRow =
  | { readonly kind: 'node'; readonly key: string }
  | { readonly kind: 'fold'; readonly fold: TurnFold }

/** The planned flow plus the signature that decides whether it changed. */
export interface ChatFlowPlan {
  readonly signature: string
  readonly rows: readonly ChatFlowRow[]
}

/**
 * Tool-name tokens per activity family, matched on `_`-delimited name
 * segments. Order is significant: housekeeping tools are classified before the
 * file work their names happen to contain (`todo_write` is not an edit).
 */
const ACTIVITY_TOKENS: readonly (readonly [FoldActivity, readonly string[]])[] = [
  ['other', ['ask', 'goal', 'job', 'question', 'skill', 'todo']],
  ['search', ['fetch', 'find', 'glob', 'grep', 'inspect', 'list', 'ls', 'read', 'search', 'view']],
  ['edit', ['create', 'delete', 'edit', 'move', 'multiedit', 'patch', 'remove', 'replace', 'write']],
  ['run', ['bash', 'code', 'exec', 'powershell', 'pwsh', 'run', 'sh', 'shell', 'terminal']],
  ['delegate', ['agent', 'delegate', 'fork', 'ralph', 'spawn', 'subagent', 'workflow']],
]

/** Presentation order for families that tie on count. */
const ACTIVITY_ORDER: readonly FoldActivity[] = ['search', 'edit', 'run', 'delegate', 'other']

/**
 * Classify one Tool name into its activity family.
 * @param name - wire Tool name, possibly nested (`subagent_fork`).
 * @returns the family whose token matches a name segment, else `other`.
 */
export function foldActivityOf(name: string): FoldActivity {
  const segments = name.toLowerCase().split(/[^a-z0-9]+/)
  for (const [activity, tokens] of ACTIVITY_TOKENS) {
    if (tokens.some(token => segments.includes(token))) return activity
  }
  return 'other'
}

/** Resolve a block's wire Tool name from either Tool lifecycle form. */
function callName(block: ToolCallBlock): string {
  return 'kind' in block ? block.call?.name ?? '' : block.name
}

/**
 * Tally one Tool root's leaf calls into `tally`.
 *
 * A root that owns subcalls is a wrapper (Code Mode's `run_code`), so only
 * leaves are counted: the tally answers what the Turn actually did, not how
 * many wrappers it went through.
 * @param block - Tool root or nested subcall.
 * @param tally - mutable activity counters.
 */
function tallyLeaves(block: ToolCallBlock, tally: Map<FoldActivity, number>): void {
  if (block.subCalls.length > 0) {
    for (const child of block.subCalls) tallyLeaves(child, tally)
    return
  }
  const activity = foldActivityOf(callName(block))
  tally.set(activity, (tally.get(activity) ?? 0) + 1)
}

/** The Turn coordinate a Node is placed in, when it has one. */
function turnOf(node: ChatNode): number | undefined {
  const location = node.location
  if (location.kind === 'step' || location.kind === 'turn') return location.turn.turn
  return undefined
}

/**
 * Key of each Turn's closing Assistant step — the answer that never folds.
 *
 * The last Assistant step in flow order is the Turn's closing one; earlier
 * steps are the narration and reasoning that lead to it.
 * @param chat - Chat snapshot.
 * @returns Turn number to the key of its closing Assistant step.
 */
function closingAssistantKeys(chat: ChatSnapshot): ReadonlyMap<number, string> {
  const closing = new Map<number, string>()
  for (const key of chat.order) {
    const node = chat.nodes.get(key) as ChatNode | undefined
    if (node?.kind !== 'assistant-step') continue
    const turn = turnOf(node)
    if (turn !== undefined) closing.set(turn, key)
  }
  return closing
}

/** Whether one Node is process material a fold may own. */
function isProcessRow(node: ChatNode, turn: number, closing: ReadonlyMap<number, string>, key: string): boolean {
  if (node.kind === 'tool-call') return true
  return node.kind === 'assistant-step' && closing.get(turn) !== key
}

/**
 * Build one fold from the rows it owns.
 * @param chat - Chat snapshot the rows were planned from.
 * @param turn - Turn number the rows belong to.
 * @param keys - ordered member Node keys.
 * @returns the fold with its summary inputs resolved.
 */
function buildFold(chat: ChatSnapshot, turn: number, keys: readonly string[]): TurnFold {
  const tally = new Map<FoldActivity, number>()
  let reasoning = 0
  for (const key of keys) {
    const node = chat.nodes.get(key) as ChatNode | undefined
    if (node?.kind === 'assistant-step') reasoning += 1
    else if (node?.kind === 'tool-call') tallyLeaves(node.data.root, tally)
  }
  const location = chat.timeline.turns.get(turn)
  const start = location?.start?.time
  const end = location?.end?.time
  const activities = [...tally.entries()]
    .map(([activity, count]) => ({ activity, count }))
    .sort((left, right) =>
      right.count - left.count || ACTIVITY_ORDER.indexOf(left.activity) - ACTIVITY_ORDER.indexOf(right.activity))
  return {
    id: `fold:${turn}`,
    turn,
    keys,
    reasoning,
    activities,
    durationMs: start === undefined || end === undefined ? null : Math.max(0, end - start),
    running: location?.status === 'open',
  }
}

/**
 * Plan the Chat flow: which Nodes render in place and which collapse into a
 * Turn fold.
 * @param chat - Chat snapshot (ordered visible Nodes plus the Turn timeline).
 * @returns the flow rows and the signature of their content.
 */
export function planChatFlow(chat: ChatSnapshot): ChatFlowPlan {
  const closing = closingAssistantKeys(chat)
  const rows: ChatFlowRow[] = []
  let openTurn: number | null = null
  let openKeys: string[] = []
  const flush = (): void => {
    if (openTurn === null) return
    if (openKeys.length >= MIN_FOLD_ROWS) rows.push({ kind: 'fold', fold: buildFold(chat, openTurn, openKeys) })
    else for (const key of openKeys) rows.push({ kind: 'node', key })
    openTurn = null
    openKeys = []
  }
  for (const key of chat.order) {
    const node = chat.nodes.get(key) as ChatNode | undefined
    const turn = node === undefined ? undefined : turnOf(node)
    if (node === undefined || turn === undefined || !isProcessRow(node, turn, closing, key)) {
      flush()
      rows.push({ kind: 'node', key })
      continue
    }
    if (openTurn !== turn) flush()
    // A fold never spans Turns: the row below a Turn boundary is a new answer.
    if (openTurn === null) openTurn = turn
    openKeys.push(key)
  }
  flush()
  return { signature: JSON.stringify(rows), rows }
}

/**
 * Skip a Chat re-render when the planned flow is unchanged.
 * @param left - previous plan.
 * @param right - candidate plan.
 * @returns whether both plans describe the same rows.
 */
export function sameChatFlowPlan(left: ChatFlowPlan, right: ChatFlowPlan): boolean {
  return left.signature === right.signature
}
