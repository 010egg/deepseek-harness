// Turn-fold planning: which Chat rows stay in place and which collapse into a
// Turn's process fold, plus the activity summary the folded header shows.
// Driven through the canonical Chat fixture (the same snapshot shape the view
// reads), so the planner is exercised on the real ordering contract.

import { describe, expect, it } from 'vitest'
import type {
  AssistantBlock, ConversationNode, ToolCallBlock, ToolResultNode,
} from '@deepseek-ai/dsh-client-runtime/client'
import {
  foldActivityOf, planChatFlow, sameChatFlowPlan, type ChatFlowRow, type TurnFold,
} from '../src/client/chat/turn-folds.ts'
import { chatSnapshotFixture } from './chat-snapshot-fixture.client.ts'

const user = (seq: number, text: string): ConversationNode => ({
  kind: 'user', seq, time: seq * 1_000, content: [{ type: 'text', text }], source: null,
})
const assistant = (seq: number, blocks: readonly AssistantBlock[], turn: number): ConversationNode => ({
  kind: 'assistant', seq, time: seq * 1_000, turn, step: 1, blocks,
})
const said = (seq: number, text: string, turn: number): ConversationNode =>
  assistant(seq, [{ kind: 'text', text }], turn)
const thought = (seq: number, turn: number): ConversationNode =>
  assistant(seq, [{ kind: 'reasoning', text: `reasoning-${String(seq)}` }], turn)
const call = (
  seq: number,
  callId: string,
  name: string,
  turn: number,
  subCalls: readonly ToolCallBlock[] = [],
): ConversationNode => ({
  kind: 'tool-result', seq, time: seq * 1_000, callId, turn, content: [], isError: false,
  callView: null, resultView: null,
  call: { name, argsRaw: '{}' },
  callTime: seq * 1_000,
  subCalls,
} as ToolResultNode)

/** One closed Turn: its process rows plus the answer they produced. */
function closedTurn(nodes: readonly ConversationNode[], turn = 1, start = 1_000, end = 61_000) {
  return chatSnapshotFixture({
    nodes,
    turnTimings: new Map([[turn, { startTime: start, endTime: end }]]),
    turnEnds: new Map([[turn, nodes.length + 1]]),
  })
}

/** Narrow one planned row to its fold, failing the test on any other row. */
function foldAt(rows: readonly ChatFlowRow[], index: number): TurnFold {
  const row = rows[index]
  if (row?.kind !== 'fold') throw new TypeError(`row ${String(index)} is not a fold`)
  return row.fold
}

/** Row kinds and the key each row carries, for whole-flow assertions. */
function shape(rows: readonly ChatFlowRow[]): readonly string[] {
  return rows.map(row => row.kind === 'node' ? `node:${row.key}` : `fold:${String(row.fold.turn)}`)
}

describe('planChatFlow', () => {
  it('folds a closed turn\'s steps and leaves its closing answer in place', () => {
    const chat = closedTurn([
      user(1, 'do the thing'),
      thought(2, 1),
      call(3, 'a', 'bash', 1),
      thought(4, 1),
      said(5, 'done', 1),
    ])
    const { rows } = planChatFlow(chat)
    // The answer and the turn tail stay where they are; everything that led to
    // the answer is one fold.
    expect(shape(rows)).toEqual([
      'node:fixture:user:1',
      'fold:1',
      'node:fixture:assistant:5',
      'node:fixture:turn-tail:1',
    ])
    const fold = foldAt(rows, 1)
    expect(fold.keys).toEqual(['fixture:assistant:2', 'fixture:tool:a', 'fixture:assistant:4'])
    expect(fold.reasoning).toBe(2)
    expect(fold.activities).toEqual([{ activity: 'run', count: 1 }])
    expect(fold.durationMs).toBe(60_000)
    expect(fold.running).toBe(false)
  })

  it('leaves a lone process row in place instead of hiding it behind a header', () => {
    const chat = closedTurn([user(1, 'go'), call(3, 'a', 'bash', 1), said(4, 'done', 1)])
    const { rows } = planChatFlow(chat)
    expect(shape(rows)).toEqual([
      'node:fixture:user:1',
      'node:fixture:tool:a',
      'node:fixture:assistant:4',
      'node:fixture:turn-tail:1',
    ])
  })

  it('reports an open turn as running so the view can keep its work visible', () => {
    const chat = chatSnapshotFixture({
      nodes: [user(1, 'go'), thought(2, 1), call(3, 'a', 'bash', 1), said(4, 'partial', 1)],
    })
    const { rows } = planChatFlow(chat)
    expect(foldAt(rows, 1).running).toBe(true)
    expect(foldAt(rows, 1).durationMs).toBeNull()
  })

  it('counts leaf calls, so a wrapper root reports what it actually did', () => {
    const chat = closedTurn([
      user(1, 'go'),
      thought(2, 1),
      call(3, 'wrapper', 'run_code', 1, [
        call(4, 'b', 'grep', 1) as ToolCallBlock,
        call(5, 'c', 'glob', 1) as ToolCallBlock,
        call(6, 'd', 'bash', 1) as ToolCallBlock,
      ]),
      said(7, 'done', 1),
    ])
    const fold = foldAt(planChatFlow(chat).rows, 1)
    expect(fold.activities).toEqual([{ activity: 'search', count: 2 }, { activity: 'run', count: 1 }])
  })

  it('never spans turns: each Turn folds its own steps', () => {
    const chat = chatSnapshotFixture({
      nodes: [
        user(1, 'first'), thought(2, 1), call(3, 'a', 'bash', 1), said(4, 'one', 1),
        user(5, 'second'), thought(6, 2), call(7, 'b', 'grep', 2), said(8, 'two', 2),
      ],
      turnTimings: new Map([[1, { startTime: 1_000, endTime: 2_000 }], [2, { startTime: 3_000, endTime: 4_000 }]]),
      turnEnds: new Map([[1, 5], [2, 9]]),
    })
    const { rows } = planChatFlow(chat)
    expect(shape(rows).filter(entry => entry.startsWith('fold'))).toEqual(['fold:1', 'fold:2'])
  })

  it('keeps the plan signature stable until a row or summary changes', () => {
    const nodes = [user(1, 'go'), thought(2, 1), call(3, 'a', 'bash', 1), said(4, 'done', 1)] as const
    const chat = closedTurn(nodes)
    const first = planChatFlow(chat)
    expect(sameChatFlowPlan(first, planChatFlow(chat))).toBe(true)
    const extended = closedTurn([...nodes, user(5, 'again')])
    expect(sameChatFlowPlan(first, planChatFlow(extended))).toBe(false)
  })
})

describe('foldActivityOf', () => {
  it.each([
    ['grep', 'search'],
    ['read', 'search'],
    ['web_search', 'search'],
    ['edit', 'edit'],
    ['str_replace_editor', 'edit'],
    ['bash', 'run'],
    ['run_code', 'run'],
    ['subagent_fork', 'delegate'],
    ['workflow', 'delegate'],
    // Housekeeping wins over the file verb inside the name.
    ['todo_write', 'other'],
    ['ask_user_question', 'other'],
    ['unknown_tool', 'other'],
  ])('classifies %s as %s', (name, activity) => {
    expect(foldActivityOf(name)).toBe(activity)
  })
})
