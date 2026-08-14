# #36 — Network plane polish (post-eip-core rename)

**Roadmap:** [../roadmap.md](../roadmap.md) `#36`  
**Status (mirror):** **done** — sections 1–3 landed; live SoT promoted (`network.md` / `config.md` / `traefik.md` / `eip sync` in `verbs.md`).

**History.** Live behaviour is in stack / CLI docs; this overlay keeps decisions and how-it-landed notes.

**Rules (docs process):** Read and following [`../../documentation-rules.md`](../../documentation-rules.md) and [`../../technical-rules.md`](../../technical-rules.md) (migration-plans). Phase 1 done for [`../contents.md`](../contents.md). No live SoT edits until promote.

**Rules (code — when implementing):** Migration process does not relax engineering bars. Implementation follows:

| Layer | Path | What binds this ticket |
|-------|------|------------------------|
| Master | [`../../../technical-rules.md`](../../../technical-rules.md) | **One SoT** (fragment YAML / catalog — no scattered network/service string lists); **reusable helpers** in shared packages; extend existing Sync/deploy apply paths; no legacy wrappers; test as we build; host ops stay Deployment Tool verbs |
| Deployment Tool | [`../../../deployment/deployment-tool/technical-rules.md`](../../../deployment/deployment-tool/technical-rules.md) | Module conventions → `cli/engineering.md`; no parallel ship verbs |
| Stack | [`../../../stack/technical-rules.md`](../../../stack/technical-rules.md) | Fragments are membership SoT; Moby/SDK changes via Deployment Tool; no socket on app containers |

Choices already explained and locked below (reusable ensure vs Prom-only; resolve-from-docs vs parallel consts).

## What changed

### Section 1 — config schema (landed)

- `addons.observability.grafana.public` bool on `eip.config.yaml` (omit → `false`)
- `addons.observability.grafana.base_url` — scheme+host only (no path); `DefaultConfig` sets `http://127.0.0.1` (same idea as default `paths.grafana`); omit/blank still falls back to that. Combined with `paths.grafana` → effective Grafana root URL
- Validate: `public: true` requires non-empty `paths.grafana`; `base_url` if set → http(s)+host and **no path** (path is separate)
- TUI **Grafana** section: Path + Base URL + Public; `GRAFANA_ROOT_URL` removed from Secrets `EnvFields` (SyncEnv bridge only)
- `SummaryLines` includes `grafana.public` + effective combined root URL

### Section 2 — ensure helper + name resolve (landed)

- `docker.EnsureServiceNetwork` / `DesireNetworks` / `NetworkTargetsContain`
- Detach tolerates missing network (name-only match)

### Section 3 — Prom + Grafana wire (landed)

- **Network name SoT = fragment YAML** — `x-net-*` anchors; reuse in `networks.*.name` and labels.
- **Single ensure path:** `ApplyLabeledNetworkMemberships` for all runtime attach/detach
  - `eip.network.attach` (+ optional `eip.network.attach.when`: `observability` | `grafana.public`)
  - `eip.network.detach` (always off)
  - attach only if when passes **and** network is in the active fragment set
- Prom: `attach: *net-obs` + `when: observability`
- Grafana: `detach: *net-core`; `attach: *net-public` + `when: grafana.public`
- `ApplyGrafanaPath` — path/Traefik labels only (no ServiceUpdate networks)
- Hooks: labeled ensure before prune when obs off; after deploy when on; then Grafana path; `eip sync` same order

## How this part works after the change

**Obs on:** stack deploy merges obs fragment (Alloy already on mesh+obs). Then `ApplyObsPlaneMembership` attaches prometheus to obs overlay. `ApplyGrafanaPath` applies path; if `grafana.public`, enables Traefik labels + edge attach; else private (enable false, no edge, off mesh).

**Obs off:** prune removes obs services; `ApplyObsPlaneMembership` detaches prometheus from obs (no-op if network already gone).

**Day-2:** `eip sync` re-applies Prom membership + Grafana path/public without a new verb.

## Still open (code)

_None — promote done._ Drafts kept as history: [36-promote-draft.md](./36-promote-draft.md).

## Missing live SoT discovered mid-work

_None yet._

## Notes / decisions (locked)

### Behaviour

1. **Prom + Alloy when obs on** — Alloy only exists in the obs fragment (absent when addon off). Obs YAML already dual-homes Alloy on `eip-core` + `eip-obs` (+ alloy docker-proxy net); merge/deploy applies that — no runtime ensure for Alloy. Deployment Tool attaches **Prom** to the obs overlay when obs turns on; detaches when obs turns off. Clean separate — no leftover obs attachments with addon off.
2. **Grafana** — obs overlay only for data after Prom dual-home. Config bool `addons.observability.grafana.public` (default **false**). Public requires path + websecure + edge overlay; private has no edge.
3. **Already cleared:** phantom `EIP_NETWORK_NAME` / `engine.NetworkName`; legacy mesh rename. Capacity docker-proxy net stays on **#18**.

### Deployment Tool — network ensure (locked)

Bound by master **One SoT** + **reusable helpers** / extend-shared-packages (see Rules table above): fragment YAML owns plane/service names; Go resolves, does not re-type.

| Piece | Rule |
|-------|------|
| **Helper** | One reusable idempotent ensure (attach/detach **one** resolved network on **one** Swarm service via ServiceUpdate). Callers compose. Not Prom-specific. |
| **Names** | One vocabulary: Docker network **name** from fragment YAML (`x-net-*` anchors). Service labels carry that name; Go resolves via `ResolveNetworkRef`. |
| **Lookups** | Label **keys** (`eip.network.attach` / `detach`) live in `stack`; values never hard-coded as network names in Go. |
| **Forbidden** | Parallel role/plane vocabularies; `const` lists of `eip-core` / `eip-public` / `eip-obs` in Go; container `NetworkConnect` for Swarm services; new CLI verb. |
| **Hooks** | `deploy.Run` / rematerialize after obs merge/prune; extend `ApplyGrafanaPath` (already on `eip sync`) for public/private edge. |

### Config (locked)

- `addons.observability.grafana.public` bool, default `false` (omit in YAML → Go zero / private; fine for now)
- When `public: true`, `paths.grafana` required (validate in config / ConfigFields)
- `addons.observability.grafana.base_url` default `http://127.0.0.1` in starter config; omit/blank still that fallback; tool combines with `paths.grafana` for SyncEnv `GRAFANA_ROOT_URL` + apply `GF_SERVER_ROOT_URL` (not Secrets `.env`)
- **Deferred:** auto-merge / rewrite of on-disk `eip.config.yaml` (and `.env`) when the CLI gains new keys — operators may add keys manually until an updater exists. `eip sync` does not write missing keys into the YAML file today.
