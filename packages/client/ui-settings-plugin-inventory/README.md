# @deepseek-ai/dsh-client-ui-settings-plugin-inventory

English | [中文](README.zh.md)

Read-only **Plugin list** tab for Web Settings. The browser plugin registers one localized `settings.plugins.tab` contribution with id `all`; the Plugins section owns the navigation entry and tab chrome. It performs no Remote read during plugin activation. Selecting the tab for the first time mounts it and lazily calls `ctx.remote.pluginInventory.list()` through [`api-remotes`](../../api/remotes/README.md).

The tab renders a searchable catalog as collapsible category folders (Agent and models, Tools and automation, Execution and permissions, Sessions and data, Web services, Browser UI, System foundation, Other plugins). Categories are client-owned presentation metadata: an exact catalog maps built-in module specifiers to a category, and any custom or unknown module falls into **Other plugins**, so out-of-tree deployments remain visible without matching a naming convention. Folder order is fixed, while entries keep Loader order inside their folder. Each folder row shows an open/closed folder glyph, the category name, and its entry count; clicking it toggles a single-column list of compact file rows, so the collapsed view stays small. Entering a search query auto-opens every folder that has a match. Each file row shows a plugin glyph, the short module name, and a small effective-enablement tag; enabled entries also show a colored root-fiber status dot. Expanding one row reveals its Loader-tree entry id without a redundant field label, followed by the effective configuration and, for enabled entries, Cordis status. Disabled entries omit the redundant unmounted runtime state. The entry id remains the React key, disclosure identity, detail value, and an additional search target; it is never classified by string shape. Loading, empty, no-match, and generic failure states stay local to the mounted component, and a failed read can be retried without exposing transport details. The registration uses `ctx.slots.inject()`, so it follows late tab declaration, redeclaration, locale changes, and teardown without importing the section owner.

## Model Experience

None, as this package only visualizes a Host-owned deployment snapshot in browser Settings and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **One snapshot per Settings mount or retry** — the tab does not subscribe to Loader changes or automatically refetch after reconnect; switching tabs preserves the current snapshot, while reopening Settings obtains a new one.
- **Read-only Loader view** — local search does not add provenance, current-browser activation diagnosis, grouping by source, or plugin mutation controls; the category catalog is client-owned and does not travel with the Host snapshot.
