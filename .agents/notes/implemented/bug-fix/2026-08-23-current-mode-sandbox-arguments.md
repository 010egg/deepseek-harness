# Agent Note: Current-mode sandbox arguments and per-request escalation schema narrowing

Status: implemented

English | [中文](2026-08-23-current-mode-sandbox-arguments.zh.md)

## Problem

The sandbox tools (`bash`, `pwsh`, `write`, `edit`) advertise paired `sandbox_permissions` + `justification` fields whenever a confining executor is mounted, and execution rejects any request that is not strictly wider than the call's effective mode. The schema lists both fields as optional, but some provider schema dialects treat every advertised property as required even when the JSON Schema marks it optional: the model-facing tool projection and the pi-ai OpenAI Responses conversion force the optional parameters into every call. A model that fills every required-looking field under a session whose effective mode is one of the advertised targets emits its standing mode — `sandbox_permissions: "workspace-write"` under the web default, or `"danger-full-access"` — and the call self-rejects with `sandbox escalation to "<mode>" is not strictly wider than this call's current "<mode>" mode`. Every ordinary call becomes impossible without a permission toggle; under `danger-full-access` the fields are the only advertised sandbox inputs, so the GUI agent could not run any bash or mutation at all.

## Decision

Two coordinated changes keep the execution boundary intact while making an ordinary call expressible:

1. `dsh-sandbox-policy` narrows the model-visible `sandbox_permissions` enum per agent request in the `system-prompt/assemble` waterfall — the shared assembly step that already resolves the session policy for the `sandbox:policy` context — to `[effectiveMode, ...WIDER_MODES[effectiveMode]]`. Read-only advertises all three modes, workspace-write advertises workspace-write + danger-full-access, and danger-full-access advertises only itself. The registry schema stays global and the tool catalog is unchanged; only the assembled snapshot's enum mutates, derived from the same `resolve({ session })` the enforcing backends read, so the advertised set cannot contradict the executing policy. Agentless catalogs and tools without the paired fields are untouched.

2. `approveEscalation` treats a request equal to the call's effective mode as an ordinary call: it returns the standing mode without consulting approval, and the call executes exactly as if no sandbox argument were present. A strictly wider request still resolves `ctx.approval` before execution with the same fail-closed choreography; a narrower or unknown mode still fails with the existing `not strictly wider` text and never prompts. `ESCALATION_TARGETS` — the closed argument vocabulary — now includes `read-only`, because an equal request may target any standing mode. The enforcing tools (`bash`, `pwsh`, `write`, `edit`) additionally skip the justification pairing for an equal request, so a provider that forces `sandbox_permissions` without `justification` still issues an ordinary call; any wider request keeps the pairing requirement.

This partially supersedes the "Per-session dynamic tool schemas" rejection in [the sandbox decision](../feature/2026-07-06-sandbox.md): re-registering tools per session is still rejected, but the new mechanism mutates the assembled snapshot's enum per request instead, and it is justified by a concrete provider defect rather than hypothetical gains. Execution remains the safety boundary; the enum narrowing is advertising only.

## Alternatives considered

**Delete the escalation fields from full-access requests instead.** Rejected: it fixes only `danger-full-access`; a `workspace-write` session — the web default — still self-rejects because the projection forces the optional fields, so the model cannot express any call. Equal-mode acceptance fixes every standing mode with one rule.

**Accept equal mode at execution but keep the enum registry-global.** Rejected: the enum would advertise modes the model must not request (anything narrower than standing), and a projection that forces advertised properties would still steer the model toward those invalid values. Narrowing the enum per request keeps the schema truthful at zero execution cost.

**Make the schema's `required` array authoritative.** Rejected: the schema already marks both fields optional; the forcing projection lives outside this repository's tool schema (the provider adapter), so the fix must live at the assembly and execution boundary the harness owns.

**Re-register tools per session.** Rejected by the sandbox decision for per-session header churn; the snapshot mutation achieves the same model-visible truth without registration lifecycle or tool-order churn.

## Consequences

Under every sandbox mode, an ordinary `bash`/`pwsh`/`write`/`edit` call executes without approval even when the provider projection demands the advertised fields; under `danger-full-access` the GUI operates without a permission toggle. A genuinely wider retry still prompts; a narrower or unknown injected value still fails closed with the same text and prompts no one. No grant is persisted, and nothing else about the escalation flow changes.

The request-header schema tokens for the escalation enum now differ per session mode, so a mode switch invalidates cache reuse from those tool definitions once — the same cost class as the existing per-mode runtime-context snapshot, restricted to the changed schema bytes.

## Testing

The shared `dsh-sandbox` suite pins equal-mode passthrough for all three modes and the unchanged narrower/unknown fail-closed text. The `dsh-sandbox-policy` suite pins the assembled enum `[mode, ...WIDER_MODES[mode]]` per session mode, the unchanged agentless catalog, and the projection's disposal with the policy fiber. The `dsh-tool-bash`, `dsh-tool-pwsh`, and `dsh-tool-fs` suites pin the full argument vocabulary in the advertised schema, prove an equal-mode injected call executes without an `approval/asked` event while a narrower one fails without prompting, and prove an equal-mode request without `justification` executes while a wider one without it still fails the pairing check. The web permission-policy replay assembles the real Loader composition and asserts each mode switch appends a header whose `bash`/`write`/`edit` escalation enum is the effective mode plus strictly wider retries.
