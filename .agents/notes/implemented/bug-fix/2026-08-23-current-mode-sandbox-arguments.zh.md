# Agent Note: 当前模式沙箱参数与逐请求的升级 schema 收窄

Status: implemented

[English](2026-08-23-current-mode-sandbox-arguments.md) | 中文

## 问题

沙箱工具（`bash`、`pwsh`、`write`、`edit`）只要挂载了受限执行器就会公布配对的 `sandbox_permissions` + `justification` 字段，而执行层拒绝任何不严格宽于调用有效模式的请求。schema 将两个字段都标记为可选，但某些提供方 schema 方言即使 JSON Schema 标注可选，也会把所有已公布属性当作必填：面向模型的工具投影与 pi-ai OpenAI Responses 转换会把可选参数强塞进每次调用。在有效模式恰为某个已公布目标的会话里（web 默认的 `workspace-write`，或 `danger-full-access`），一个会把所有看似必填字段都填上的模型会填入自己的常驻模式——`sandbox_permissions: "workspace-write"` 或 `"danger-full-access"`——随即被自拒绝：`sandbox escalation to "<mode>" is not strictly wider than this call's current "<mode>" mode`。普通调用变得无法发出，除非切换权限；在 `danger-full-access` 下这两个字段是唯一公布的沙箱输入，GUI agent 完全无法运行任何 bash 或变更操作。

## 决策

两项协调改动保持执行边界不变，同时让普通调用变得可表达：

1. `dsh-sandbox-policy` 在 `system-prompt/assemble` waterfall——即已经为 `sandbox:policy` 上下文解析会话策略的共享组装步骤——把模型可见的 `sandbox_permissions` 枚举按 agent 请求收窄为 `[effectiveMode, ...WIDER_MODES[effectiveMode]]`。read-only 公布全部三种模式，workspace-write 公布 workspace-write + danger-full-access，danger-full-access 只公布自身。注册表 schema 仍保持全局、工具目录不变；只有组装快照中的枚举被改写，且派生自强制执行后端读取的同一个 `resolve({ session })`，因此公布集合不可能与执行策略矛盾。无 agent 的目录和不带配对字段的工具不受影响。

2. `approveEscalation` 把等于调用有效模式的请求当作普通调用：它直接返回常驻模式、不咨询审批，调用与未携带任何沙箱参数时完全一致地执行。严格更宽的请求仍按原有 fail-closed 编排在执行前解析 `ctx.approval`；更窄或未知模式仍以既有的 `not strictly wider` 文本失败且绝不提示。封闭的参数词汇 `ESCALATION_TARGETS` 现在包含 `read-only`，因为相等请求可能针对任意常驻模式。执行强制工具（`bash`、`pwsh`、`write`、`edit`）还会对相等请求跳过 justification 配对，因此只强制 `sandbox_permissions` 而不带 `justification` 的提供方投影仍能发出普通调用；任何更宽请求仍保留配对要求。

本决策部分取代[沙箱决策](../feature/2026-07-06-sandbox.zh.md)中「按会话动态工具 schema」的否决：按会话重新注册工具仍被否决，但新机制改为改写组装快照中的枚举，并以具体的提供方缺陷而非假想收益作为理由。执行层仍是安全边界；枚举收窄只是公布行为。

## 考虑过的替代方案

**在 full-access 请求中删除升级字段。** 否决：只修复 `danger-full-access`；`workspace-write` 会话——web 默认——仍会因投影强制可选字段而自拒绝，模型无法表达任何调用。相等模式接受用一条规则修复了所有常驻模式。

**执行层接受相等模式，但枚举保持注册表全局。** 否决：枚举会公布模型不该请求的模式（任何窄于常驻的档位），而强制已公布属性的投影仍会把模型推向这些非法值。逐请求收窄枚举以零执行成本让 schema 保持真实。

**让 schema 的 `required` 数组成为权威。** 否决：schema 已把两个字段标为可选；强制投影位于本仓库工具 schema 之外（提供方适配器），因此修复必须落在 harness 拥有的组装与执行边界上。

**按会话重新注册工具。** 被沙箱决策以逐会话 header 抖动为由否决；快照改写以同样的模型可见真实性达成目标，却不带来注册生命周期或工具顺序抖动。

## 后果

在每种沙箱模式下，即使提供方投影要求已公布字段，普通 `bash`/`pwsh`/`write`/`edit` 调用也无需审批即可执行；`danger-full-access` 下 GUI 不再需要权限切换即可运行。真正的更宽重试仍会提示；更窄或未知的注入值仍以相同文本 fail-closed 且不提示任何人。授权从不持久化，升级流程其余部分不变。

请求头中升级枚举的 schema token 现在随会话模式变化，因此一次模式切换会使这些工具定义的一次性缓存复用失效——与既有逐模式运行时上下文快照相同的成本类别，且只限于变化的 schema 字节。

## 测试

共享的 `dsh-sandbox` 套件钉住三种模式的相等模式直通与不变的更窄／未知 fail-closed 文本。`dsh-sandbox-policy` 套件钉住按会话模式的组装枚举 `[mode, ...WIDER_MODES[mode]]`、不变的 agentless 目录，以及投影随策略 fiber 一起释放。`dsh-tool-bash`、`dsh-tool-pwsh` 与 `dsh-tool-fs` 套件钉住公布 schema 中的完整参数词汇，并证明相等模式的注入调用执行时不产生 `approval/asked` 事件，而更窄调用不提示即失败；还证明不带 `justification` 的相等模式请求会执行，而不带它的更宽请求仍会失败于配对校验。Web 权限策略回放组装真实 Loader 组合，并断言每次模式切换都会追加一个 header，其 `bash`/`write`/`edit` 升权枚举为有效模式加严格更宽的重试。
