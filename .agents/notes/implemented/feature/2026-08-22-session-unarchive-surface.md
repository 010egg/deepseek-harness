# Agent Note: Session unarchive surface

Status: implemented

English | [中文](2026-08-22-session-unarchive-surface.zh.md)

## Problem

[Session archive](../feature/2026-07-31-session-archive-global-set.md) shipped with no way back: an archived session kept its log and its workspace accounting slot, but nothing in the UI or RPC surface could remove it from the registry-global archive set, and the browser tree had no surface showing archived sessions at all. That note recorded the gap as a README Known Limitation and left the reversal for a later change.

## Decision

**`unarchiveSession` is the inverse of `archiveSession` at every layer it touches, and the browser tree gains a trailing `Archived` section as the sole surface for archived sessions and their unarchive action.**

- Registry: `ctx.workspaceRegistry.unarchiveSession(id)` rides the same `enqueueOperation` queue as archive/create/delete. It filters the id out of `archivedSessionIds` and writes only when the id is present. Unlike `archiveSession`, it never checks whether the session still exists — archive membership is the only precondition, so a session whose log was deleted since archiving unarchives without error.
- RPC: `workspace.unarchiveSession({sessionId}) → {archivedSessionIds}`, mirroring `workspace.archiveSession`'s full-set response. It has no `session-not-found` error path since the registry never rejects; storage/durability failures propagate as internal errors. The existing `host/archived-sessions-changed` frame already compares the full set on every domain change, so it fires for unarchive with no new emission code.
- Client runtime and UI contract: `IWorkspaces.unarchiveSession(sessionId)` mirrors `archiveSession`, and the `WorkspaceBrowserSlots` menu contract gains an `onSessionUnarchive` action alongside `onSessionArchive`.
- Tree derivation (`tree.ts`): a new `archivedSessionRows()` helper projects the archive set into session rows (newest-first, subagent-origin and blank placeholders excluded, same as every other surface). `deriveGroups` appends one trailing `GroupNode` with `archived: true`, key `ARCHIVED_GROUP_KEY`, and no backing `workspaceId` — it only appears once the set is non-empty, so an app with no archived sessions renders no new UI. This section is the archived session's only surface anywhere in the tree; every other surface keeps filtering the set out exactly as before.
- Row menu: `SessionNodeItem` renders an `Unarchive` action instead of `Archive` when its row belongs to the archived section (`onUnarchive` passed instead of `onArchive`); the archived section itself carries no group-header actions (rename/reorder/add), since it has no backing Workspace.

## Alternatives considered

**A separate "view archived sessions" dialog or settings page**, decoupled from the grouped/flat tree. Rejected: the tree already owns every other session-visibility surface (Ungrouped, search, flat list); a second, disconnected surface for one group would duplicate row rendering, menu wiring, and selection handling for no navigational benefit.

**Un-hiding an archived session directly in its original group with an inline "restore" affordance**, instead of a dedicated section. Rejected: an archived session may belong to a workspace that was since deleted, or its origin may otherwise be ambiguous; a dedicated trailing section gives every archived row one predictable home regardless of origin, and keeps the ordinary group loop's filtering logic unchanged.

**Letting the archived section behave like an ordinary Workspace group (own expansion, drag-reorder, rename).** Rejected: the section has no backing Workspace entity to persist any of that state against; it only needs expand/collapse (which `expandedGroups`, already keyed by string, covers for free) and a per-row unarchive action.

## Consequences

Archiving and unarchiving are now a complete round trip: a session removed from every grouping surface can be found again in the trailing `Archived` section and restored to its original position and workspace accounting with one click. The workspace-management e2e now asserts the full cycle (archive → row moves to the Archived section → unarchive → row returns to its original group) in place of the archive-only assertion it previously pinned. Domain, RPC, client-runtime, and UI-component tests each cover unarchive's idempotence and the unknown/deleted-session no-op case at their layer.
