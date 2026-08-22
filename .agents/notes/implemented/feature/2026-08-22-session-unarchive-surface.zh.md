# Agent Note: 会话取消归档界面

Status: implemented

[English](2026-08-22-session-unarchive-surface.md) | 中文

## 问题

[会话归档](../feature/2026-07-31-session-archive-global-set.zh.md)上线时没有回头路：被归档的会话保留其日志和 workspace 记账 slot，但 UI 和 RPC 层都没有能把它从注册表级全局归档集合里移除的入口，浏览区的树也完全没有展示已归档会话的界面。那份 note 把这个缺口记为 README 的 Known Limitation，把回退动作留给了后续变更。

## 决策

**`unarchiveSession` 在它触及的每一层都是 `archiveSession` 的逆操作，浏览区的树新增一个末尾的 `Archived` 区块，作为已归档会话及其取消归档操作的唯一界面。**

- 注册表：`ctx.workspaceRegistry.unarchiveSession(id)` 走与 archive/create/delete 相同的 `enqueueOperation` 队列。它把该 id 从 `archivedSessionIds` 中过滤掉，只在 id 确实存在时才写盘。与 `archiveSession` 不同，它从不检查该会话是否仍然存在——归档成员资格是唯一前提，因此归档后被删除日志的会话也能无错取消归档。
- RPC：`workspace.unarchiveSession({sessionId}) → {archivedSessionIds}`，与 `workspace.archiveSession` 的全量集合响应姿态一致。由于注册表从不拒绝，它没有 `session-not-found` 错误路径；存储/持久化失败会作为内部错误传播。既有的 `host/archived-sessions-changed` 帧本就在每次 domain 变更后比对全量集合，因此取消归档无需新增任何发帧代码即可触发它。
- 客户端运行时与 UI 契约：`IWorkspaces.unarchiveSession(sessionId)` 与 `archiveSession` 对称，`WorkspaceBrowserSlots` 菜单契约新增 `onSessionUnarchive` 操作，与 `onSessionArchive` 并列。
- 树派生层（`tree.ts`）：新增 `archivedSessionRows()` helper，把归档集合投影为会话行（按最近顺序，排除 subagent-origin 和空白占位符，与其它所有界面一致）。`deriveGroups` 追加一个末尾 `GroupNode`，`archived: true`，key 为 `ARCHIVED_GROUP_KEY`，没有背靠的 `workspaceId`——只有集合非空时才出现，因此没有任何归档会话的应用不会渲染出这块新 UI。这个区块是已归档会话在整棵树里唯一的展示位置；其它所有界面仍和之前一样把该集合过滤掉。
- 行菜单：`SessionNodeItem` 在其所在行属于归档区块时渲染 `Unarchive` 操作而非 `Archive`（传入 `onUnarchive` 而非 `onArchive`）；归档区块本身不携带分组头操作（重命名/重排序/添加），因为它没有背靠的 Workspace。

## 已考虑的替代方案

**一个独立的"查看已归档会话"对话框或设置页**，与分组／平铺树脱钩。否决：树本身已经承载了其它所有会话可见性界面（Ungrouped、搜索、平铺列表）；为单个分组再造一个脱节的界面，只会重复行渲染、菜单接线和选中态处理逻辑，却没有导航上的收益。

**直接在原分组里为已归档会话就地展示一个内联"恢复"操作**，而非独立区块。否决：被归档的会话可能属于一个此后已被删除的 workspace，或者其归属本就模糊；独立的末尾区块让每一行已归档会话都有一个可预测的落点，无论其来源如何，同时让普通分组循环的过滤逻辑保持不变。

**让归档区块表现得像一个普通 Workspace 分组（自带展开状态、拖拽重排、重命名）。** 否决：该区块没有背靠的 Workspace 实体可以持久化这些状态；它只需要展开/折叠（已经按字符串 key 索引的 `expandedGroups` 天然覆盖这一点）和逐行的取消归档操作。

## 后果

归档与取消归档现在构成一次完整的往返：从所有分组界面消失的会话可以在末尾的 `Archived` 区块里重新找到，一键即可恢复到其原有位置和 workspace 记账。workspace-management e2e 现在断言完整循环（归档 → 行移动到 Archived 区块 → 取消归档 → 行回到原分组），取代了此前只钉住归档单向行为的断言。domain、RPC、client-runtime 和 UI 组件测试各自在其所在层覆盖了取消归档的幂等性以及未知／已删除会话的空操作情形。
