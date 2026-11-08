// TurnFoldRow: the single summary row a Turn's process material collapses
// into. It owns the reasoning steps and Tool calls that produced the Turn's
// answer and reports what they were; the answer itself is a sibling row and is
// never inside here.
//
// Disclosure state is local and starts from the Turn's own lifecycle: an open
// Turn shows its work (the reader is watching it happen), a closed one is
// folded to a header line. A reader who toggles a fold keeps that choice for as
// long as the fold lives.

import { memo, useState, type ReactNode } from 'react'
import {
  IconChevronDownOutline14,
  IconChevronRightOutline14,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import { formatRunDuration, type RunDurationTranslate } from './message-chrome.ts'
import type { FoldActivity, TurnFold } from './turn-folds.ts'
import css from './TurnFoldRow.module.css'

/** Locale keys this row reads. */
type FoldKey =
  | 'chat.fold.label'
  | 'chat.fold.reasoning'
  | 'chat.fold.expand'
  | 'chat.fold.collapse'
  | 'chat.fold.activity.search'
  | 'chat.fold.activity.edit'
  | 'chat.fold.activity.run'
  | 'chat.fold.activity.delegate'
  | 'chat.fold.activity.other'

/** Activity family to its summary label key. */
const ACTIVITY_KEYS: Record<FoldActivity, FoldKey> = {
  search: 'chat.fold.activity.search',
  edit: 'chat.fold.activity.edit',
  run: 'chat.fold.activity.run',
  delegate: 'chat.fold.activity.delegate',
  other: 'chat.fold.activity.other',
}

/**
 * The fold's one-line account: what it did, then how long it took.
 * @param fold - planned fold.
 * @param t - locale seat supplying the fold and duration templates.
 * @returns summary text for the folded header.
 */
function foldSummary(fold: TurnFold, t: Translate<FoldKey> & RunDurationTranslate): string {
  const parts: string[] = []
  if (fold.reasoning > 0) parts.push(t('chat.fold.reasoning', { count: fold.reasoning }))
  for (const entry of fold.activities) parts.push(`${t(ACTIVITY_KEYS[entry.activity])} ${entry.count}`)
  if (fold.durationMs !== null) parts.push(formatRunDuration(fold.durationMs, t))
  return parts.join(' · ')
}

/**
 * One Turn's process disclosure.
 * @param props - the planned fold, its rendered rows, and the locale seat.
 * @returns the fold header plus, when open, the rows it owns.
 */
export const TurnFoldRow = memo(function TurnFoldRow({ fold, children, t }: {
  /** Planned fold this row discloses. */
  fold: TurnFold
  /** The Turn's process rows, mounted only while the fold is open. */
  children: ReactNode
  /** The owning view's locale seat. */
  t: ChatViewSlotProps['t']
}) {
  const [chosen, setChosen] = useState<boolean | null>(null)
  const open = chosen ?? fold.running
  return (
    <div
      className={css.fold}
      data-chat-anchor-key={fold.id}
      data-chat-flow-key={fold.id}
      data-chat-flow-kind="turn-fold"
      data-turn-fold={fold.turn}
      data-fold-open={open ? 'true' : undefined}
    >
      <button
        type="button"
        className={css.head}
        aria-expanded={open}
        aria-label={open ? t('chat.fold.collapse') : t('chat.fold.expand')}
        onClick={() => { setChosen(!open) }}
      >
        <span className={css.chevron} aria-hidden>
          {open ? <IconChevronDownOutline14 /> : <IconChevronRightOutline14 />}
        </span>
        <span className={css.label} data-running={fold.running ? 'true' : undefined}>
          {t('chat.fold.label')}
        </span>
        <span className={css.summary}>{foldSummary(fold, t)}</span>
      </button>
      {open && <div className={css.body}>{children}</div>}
    </div>
  )
})
