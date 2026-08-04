# Deployment Tool — CLI verbs (promote draft: `eip sync` only)

> **Promote draft** for the **`eip sync`** bullet in live [`cli/verbs.md`](../../../deployment/deployment-tool/cli/verbs.md). Not live SoT until go-ahead. Parent: [36-network-plane-polish.md](./36-network-plane-polish.md). Index: [36-promote-draft.md](./36-promote-draft.md).

## Changes vs live (review only — delete this section on promote)

Open this file in the editor (not Preview). `diff` fences use **red = removed / green = added**.

```diff
- eip sync: … from eip.config.yaml; --dry-run / -n.
-   Membership = stack YAML labels (eip.capacity.sync, eip.config.sync).
-   Stack effect → config.md. TUI: Persist / Command — not a Main row.
+ eip sync: … from eip.config.yaml (capacity, Traefik ports/paths/proxy,
+   Grafana Path / Base URL / Access, labeled network membership); --dry-run / -n.
+   Stack labels include eip.capacity.sync, eip.config.sync, and network attach/detach labels.
+   Effect → config.md, network.md. TUI: Persist / Command — not a Main row.
```

---

## Proposed replace (under **Verb behaviour**)

- **`eip sync`**: targeted Moby `ServiceUpdate` from `eip.config.yaml` (capacity, Traefik ports/paths/proxy, Grafana Path / Base URL / Access, labeled network membership); `--dry-run` / `-n`. Stack labels include `eip.capacity.sync`, `eip.config.sync`, and network attach/detach labels. Effect → [config.md](../../../stack/config.md), [network.md](../../../stack/network.md). TUI: Persist / Command — not a Main row.

Do not add Access matrices or membership tables here — one hop only.
