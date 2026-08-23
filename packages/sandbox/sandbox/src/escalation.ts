/**
 * The escalation vocabulary and choreography shared by every sandbox-enforcing
 * tool family (`@deepseek-ai/dsh-tool-bash`, `@deepseek-ai/dsh-tool-fs`): the
 * mode ladder, the argument-pairing validation, the model-facing
 * denial/hint markers, and {@link approveEscalation} — the ordered fail-closed
 * sequence that treats the standing mode as an ordinary call and resolves a
 * wider `sandbox_permissions` request through a user-approval channel BEFORE
 * anything executes. One home keeps the tool families' approval ordering and
 * verbatim error texts from drifting apart.
 *
 * The channel is a minimal STRUCTURAL function shape ({@link EscalationAsk}),
 * not the approval service type: the tool layer — which owns the agent, the
 * call id, and the tool name — closes over `ctx.approval.request(...)` and
 * hands the closure down, so this package never depends on the approval or
 * agent packages.
 *
 * @module dsh-sandbox/escalation
 */

import { assertNever } from '@deepseek-ai/dsh-llm'
import type { SandboxMode } from './index.ts'

/**
 * The strictly-wider table: what a call whose effective mode is the key may
 * escalate TO. Execution checks this table; request assembly narrows the
 * registry-global {@link ESCALATION_TARGETS} enum to the current mode plus
 * these wider targets.
 */
export const WIDER_MODES: Record<string, readonly SandboxMode[]> = {
  'read-only': ['workspace-write', 'danger-full-access'],
  'workspace-write': ['danger-full-access'],
}

/**
 * The closed `sandbox_permissions` argument vocabulary. It includes the
 * standing mode because some provider schema dialects require every advertised
 * property; an equal request is an ordinary call and never prompts. The policy
 * owner removes narrower modes from each agent request, while execution rejects
 * any injected narrower or unknown value.
 */
export const ESCALATION_TARGETS: readonly SandboxMode[] = ['read-only', 'workspace-write', 'danger-full-access']

/**
 * Validate the escalation argument pairing a tool schema cannot express:
 * `sandbox_permissions` and `justification` travel together — an approval
 * prompt without a reason, or a reason driving nothing, is a malformed ask —
 * and the justification must be a non-empty sentence.
 * @param sandboxPermissions - the raw `sandbox_permissions` argument, if given.
 * @param justification - the raw `justification` argument, if given.
 */
export function validateEscalationArgs(sandboxPermissions: string | undefined, justification: string | undefined): void {
  if (sandboxPermissions !== undefined && justification === undefined) {
    throw new Error('invalid escalation: sandbox_permissions requires a justification')
  }
  if (justification !== undefined && sandboxPermissions === undefined) {
    throw new Error('invalid escalation: justification is only valid together with sandbox_permissions')
  }
  if (justification !== undefined && justification.trim().length === 0) {
    throw new Error('invalid justification: expected a non-empty sentence')
  }
}

/**
 * The model-facing denial marker — the one vocabulary both enforcing families
 * teach and report, so the model recognizes a policy denial identically
 * whether the kernel refused a bash file effect or the filesystem provider's
 * fence refused a mutation.
 * @param mode - the mode the denied call ran under.
 * @returns the marker line, exactly as the model sees it.
 */
export function sandboxDenialMarker(mode: SandboxMode): string {
  return `[sandbox: file access denied under ${mode} mode]`
}

/**
 * The same-turn escalation hint that rides a denial when the composition
 * advertises the escalation fields — the nudge lives at the decision point so
 * the sanctioned retry does not depend on the model recalling the tool
 * description.
 * @param subject - the family's noun for the denied action (`command` for
 *   bash, `operation` for a filesystem mutation).
 * @returns the hint line, exactly as the model sees it.
 */
export function escalationHintMarker(subject: string): string {
  return `[sandbox: escalation available — retry this exact ${subject} once with sandbox_permissions (the narrowest wider mode that suffices) + justification; the approval prompt asks the user]`
}

/**
 * The closed outcome vocabulary of one escalation ask — structurally identical
 * to the approval seam's `ApprovalOutcome` so an `ApprovalService.request`
 * return is assignable without this package importing it.
 */
export type EscalationOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'

/**
 * The minimal approval-request shape {@link approveEscalation} needs —
 * structurally the approval seam's `ApprovalService`, generic over the agent
 * type `A` and call-id type `C` so this package resolves escalations through
 * `ctx.approval` without importing the approval or agent packages (the tool
 * layer infers `A`/`C` as its own `Agent`/`CallId`).
 */
export interface EscalationApprover<A = object, C = string> {
  /**
   * Ask the human to approve one action, resolving to a closed outcome.
   * @param req - the audit-self-contained request (agent, tool, call id, reason, optional signal).
   * @returns the human's decision as a closed {@link EscalationOutcome}.
   */
  request(req: { agent: A; toolName: string; callId: C; reason: string; signal?: AbortSignal }): Promise<EscalationOutcome>
}

/**
 * The approval ingredients an escalating tool hands {@link approveEscalation}:
 * the approval requester (`ctx.approval`, or `undefined` when none is
 * composed), the calling agent (or `undefined` for an agent-less execution),
 * and the call's identity. The tool layer holds all of these; this package
 * only judges them.
 */
export interface EscalationApproval<A = object, C = string> {
  /** The approval requester (`ctx.approval`), or `undefined` when none is composed. */
  approver: EscalationApprover<A, C> | undefined
  /** The calling agent, or `undefined` for an agent-less execution (fails closed). */
  agent: A | undefined
  /** The tool-call id the approval prompt attaches to. */
  callId: C
  /** The tool name recorded on the approval request. */
  toolName: string
  /** The tool-execution abort signal the approval request rides, when present. */
  signal?: AbortSignal
}

/** One escalation request, as {@link approveEscalation} judges it. */
export interface EscalationRequest {
  /** Requested mode: the standing mode for an ordinary call, or a wider approved retry. */
  requestedMode: string
  /** The model's one-sentence reason, shown verbatim to the user inside the audit reason. */
  justification: string
  /** The call's effective mode (session override ?? composition default). */
  effectiveMode: SandboxMode
  /** The family's noun for the escalated action in user-facing texts (`command` for bash, `operation` for fs). */
  subject: string
}

/**
 * Resolve a sandbox mode request BEFORE anything executes. An equal request
 * returns the standing mode without consulting approval, which lets providers
 * that require optional schema properties issue an ordinary call. A strictly
 * wider request resolves approval and stamps the grant onto exactly this call.
 * Narrower or unknown modes, missing approval context, and every non-grant
 * outcome fail before execution.
 * @param request - the mode request to judge (see {@link EscalationRequest}).
 * @param approval - the approval ingredients the tool holds (see {@link EscalationApproval}).
 * @returns the granted mode, consumed by the one call that asked.
 */
export async function approveEscalation<A, C>(request: EscalationRequest, approval: EscalationApproval<A, C>): Promise<SandboxMode> {
  const { requestedMode: mode, effectiveMode, justification, subject } = request
  if (mode === effectiveMode) return effectiveMode
  if (!(WIDER_MODES[effectiveMode] ?? []).includes(mode as SandboxMode)) {
    throw new Error(`sandbox escalation to "${mode}" is not strictly wider than this call's current "${effectiveMode}" mode`)
  }
  if (approval.approver === undefined) {
    throw new Error(`sandbox escalation to "${mode}" requires approval, but no approval service is composed`)
  }
  if (approval.agent === undefined) {
    throw new Error(`sandbox escalation to "${mode}" requires approval, but the call has no agent to route it through`)
  }
  // Self-contained for the audit trail: approval/asked stores this reason,
  // and the target mode is part of the grant's identity.
  const outcome = await approval.approver.request({
    agent: approval.agent,
    toolName: approval.toolName,
    callId: approval.callId,
    reason: `escalate sandbox to ${mode}: ${justification}`,
    ...approval.signal ? { signal: approval.signal } : {},
  })
  switch (outcome) {
    // The registry schema pins `mode` to the closed argument vocabulary; the
    // check above proved this request is strictly wider.
    case 'allowed-once': return mode as SandboxMode
    case 'rejected': throw new Error(`the user rejected escalating this ${subject} to "${mode}"`)
    case 'cancelled': throw new Error(`approval for escalating to "${mode}" was cancelled`)
    case 'unavailable': throw new Error(`sandbox escalation to "${mode}" requires approval, but no approval channel is available`)
    default: return assertNever(outcome, 'EscalationOutcome')
  }
}
