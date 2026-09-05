# #33 — eip rebuild (dev scoped image rebuild + roll)

**Roadmap:** [../roadmap.md](../roadmap.md) `#33`  
**Status (mirror):** **done**  
**Live SoT:** [verbs.md](../../../deployment/deployment-tool/cli/verbs.md) (§ Day-2 images / `eip rebuild`).

## What changed

Local-dev day-2: **`eip rebuild`** bakes the full app group to `:bake`, promotes per-role `TAG_*` only when digest changes, rematerialises the app fragment (no Ready). Public CLI takes no role args (`--no-cache` only). Prod day-2 images remain **`eip update`**.

## How this part works after the change

→ Prefer live [verbs.md](../../../deployment/deployment-tool/cli/verbs.md). Unchanged digests keep tags → no needless Swarm rolls.

## Still open

None. Per-role bake CLI **dropped** — full-group bake + digest promote is enough for local dev.

## Notes / decisions

Internal bake helpers may still parse role name args; they are not part of the operator surface.
