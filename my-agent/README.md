# my-agent

A minimal agent skeleton demonstrating three ideas borrowed from
[`deepseek-harness`](../): a Cordis plugin runtime, the Capability Seam
pattern, and a session log that every model-visible input must be
reconstructable from. It does not depend on any `@deepseek-ai/dsh-*`
package — only on real upstream npm packages (`cosmokit`,
`@standard-schema/spec`) and a source copy of Cordis itself.

## The three ideas

**Cordis** (`src/cordis/`) is a straight source copy of the
[Cordis](https://github.com/cordiverse/cordis) plugin framework — the same
one `deepseek-harness` vendors, copied the same way (pinned source, not an
opaque dependency). See `src/cordis/NOTICE.md` for exact provenance. It
supplies `Context`, `Service`, and the event bus (including waterfall
listeners) used everywhere else in this project.

**Capability Seam**: the LLM capability is split into three roles that
`deepseek-harness` treats as one unit:

- Service Definition — `src/capabilities/llm/service.ts` declares the
  `LLMService` interface and augments `Context` with `ctx.llm`.
- Service Provider — `src/capabilities/llm/deepseek-provider.ts` implements
  that interface against the DeepSeek API and registers itself as `ctx.llm`.
- Consumer — `src/agent/loop.ts`'s `AgentLoop` declares
  `inject: ['llm']` and calls `ctx.llm.chat(...)`. It never imports
  `DeepSeekProvider`; swapping providers (a different vendor, a mock for
  tests) never touches it.

**Session Log** (`src/session/`): `SessionLog` is an append-only,
JSONL-persisted list of typed events (`UserMessageEvent`,
`AssistantMessageEvent`). `AgentLoop.turn()` builds every LLM request by
calling `SessionLog.toMessages()` — there is no separate in-memory
conversation object it could drift from. `SessionLog.replay()` reloads a
persisted log from disk alone and reconstructs the same message list,
which is the property the "model-visible ⟺ logged" rule is protecting.

## Run it

```sh
npm install
DEEPSEEK_API_KEY=... npm start
```

Type messages at the `>` prompt; `/exit` quits. Each run writes a JSONL
session log under `data/`.

Reconstruct a past session from disk, without an API key:

```sh
npm run replay -- data/session-<timestamp>.jsonl
```

## Extending

- Add a capability seam the same way the LLM one is built: an interface +
  `Context` augmentation, one or more `Service` subclasses that implement
  it, and a consumer that only ever depends on the interface.
- Add a new kind of model-visible input by adding a variant to
  `SessionEvent` (`src/session/events.ts`) and handling it in
  `SessionLog.toMessages()` — that is the single place history becomes an
  LLM request.
