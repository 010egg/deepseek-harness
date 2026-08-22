# Provenance

`src/context.ts`, `src/events.ts`, `src/fiber.ts`, `src/index.ts`,
`src/logger.ts`, `src/reflect.ts`, `src/registry.ts`, `src/service.ts`, and
`src/utils.ts` are a source copy of
[Cordis](https://github.com/cordiverse/cordis) (`packages/core`), copied
unmodified except for one mechanical change: the `@deepseek-ai/cosmokit`
import specifier was rewritten to `cosmokit`, the package's real upstream npm
name, so this project depends on the public package directly instead of a
scoped fork. `LICENSE` is the upstream MIT license, preserved as required by
its terms.

This project vendors Cordis the same way `deepseek-harness` does — as pinned
source under version control rather than an opaque npm dependency — but,
unlike `deepseek-harness`, has no other dependency on that repository: this
package does not import any `@deepseek-ai/dsh-*` package.

Do not hand-edit `src/*.ts`. To pick up upstream fixes, re-copy
`packages/core/src/*.ts` from the Cordis repository into `src/` and
re-apply the cosmokit specifier rewrite.

## Build step

`npm run build:cordis` (`tsc -p tsconfig.build.json`) compiles `src/*.ts` to
`lib/*.{js,d.ts}` (gitignored, regenerated on every `npm start` / `npm run
replay` / `npm run typecheck` via `pre*` scripts). The rest of this project
imports `../cordis/lib/index.js`, never `../cordis/src/index.ts` directly.

This mirrors how `deepseek-harness` itself consumes Cordis: downstream
packages there type-check against Cordis's *emitted* declarations, produced
by Cordis's own relaxed tsconfig, not by re-checking Cordis's raw source
under a downstream package's stricter compiler options. Checked directly
under this project's strict `tsconfig.json` (`noUncheckedIndexedAccess`,
full `noImplicitAny`, ...), Cordis's source reports diagnostics in its own
internal symbol-indexed property accesses — the same reason
`deepseek-harness` relaxes `noImplicitAny`, `noUncheckedIndexedAccess`, and
related flags specifically for `vendor/cordis`. Building once with those
relaxed flags and consuming the resulting `.d.ts` gets the same effect
without forking this project's own strictness to match.
