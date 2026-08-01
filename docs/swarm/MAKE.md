# make up / make dev vs Swarm stack

> Part of [ROADMAP.md](./ROADMAP.md). Operator-facing make story for branch **`swarm/hard-cutover`**.
>
> Quick lists: **`make help`** (public) | **`make help-dev`** (dev/ops).
>
> Scripts layout: **`scripts/bootstrap/`** (ensure / update-files), **`scripts/lib/`** (shared helpers), **`scripts/swarm/`** (bring-up + day-2), **`scripts/ops/`** (escapes), **`scripts/test/`** (smokes). The Makefile only teaches public verbs — stack rematerialize is internal. Compose YAML is a stub (Public bundle / leftover cleanup only).
>
> **Preferred host tool:** [`eip`](../admintool/README.md) (`eip up` / `eip dev` / `eip rebuild` / `eip secrets` / `eip ensure-s3` / `eip ensure-mongo`). There is no `eip release` — Swarm roll order lives in stack YAML (`start-first` app, `stop-first` data/obs). Make `release` / `dev-release` below remain for legacy scripts only.
>
> **Data plane ensure:** Make bring-up does **not** run `EnsureS3` / `EnsureMongo`. Use **`eip up`/`dev`** (Ready) or **`eip ensure-s3`** / **`eip ensure-mongo`**. Legacy `scripts/bootstrap/mongo-setup.sh` is not Swarm CMD.

## Command map (keep this short)

### Public (GHCR) - `make help`

| Command | Job |
|---------|-----|
| **`make up`** | Start or recover the app (GHCR: Swarm data + app train incl. frontend) |
| **`make status`** | Expected services vs Docker (grouped, OK/PARTIAL/DOWN); paste for support |
| **`make logs`** | Show logs — interactive service picker (+ all); `SERVICE=` / `ARGS=` optional. Follow (`ARGS='-f'`) is one service only |
| **`make cli`** | Open a shell in the app (for support). Power users: `ARGS='list'` → core `tasks` |
| **`make swarm-sync`** | Apply `eip.config` settings via ephemeral sync-env + hash-diff Swarm file configs (`eip.config.sync`). May roll when specs/config bytes change. **Not** a version ship |
| **`make swarm-secrets-sync`** | Apply secret changes from `.env`. **Not** YAML — different word order from `swarm-sync` on purpose |
| **`make update-files`** | Pull latest Makefile / scripts from Public |
| **`make release`** | Ship `.env` `APP_VERSION`: pull/roll + Redis advertise; also hash-diff Swarm file configs (same as sync; no-op if unchanged) |
| **`make restart`** | Rolling restart (picker: one service or all). Same images; **no** pull/bake/advertise |
| **`make shutdown`** | Stop the app completely; **keeps data** (no volume delete). Start again with `make up` |

Public day-2 version ship:

```bash
make update-files          # optional: refresh Makefile / scripts from Public
# set APP_VERSION in .env  # images already published on GH
make release               # pulls/rolls that version + advertise
```

Day-to-day:

```bash
make status
make logs                  # pick a service (or all)
make logs SERVICE=api ARGS='-f'   # follow one service (not with SERVICE=all)
make restart               # pick one (wave) or all (whole-stack force roll)
make shutdown              # confirm → stop; data kept
```

### Dev (local bake tags) - `make help-dev`

| Command | Job |
|---------|-----|
| **`make dev`** | Bring-up / recovery: bake Swarm (incl. frontend) to `:bake` + per-role promote, then Swarm data + app with local tags |
| **`make dev-release`** | Ship `.env` `APP_VERSION`: local rebuild/roll + Redis advertise |
| **`make rebuild`** | Default = `dev_app_services` only (bakeable roles incl. frontend; cache); `SERVICES=` optional Swarm scope (app/obs pinned OK); data-layer → `update-data`. Rolls when digest/tag changes. No advertise |
| **`make swarm-sync`** | Same as public: Swarm settings from `eip.config` (ephemeral sync-env) |
| **`make swarm-secrets-sync`** | Same as public: `.env` → Swarm elastic refresh |
| **`make update-data SERVICE=`** | Target one **data-layer** Swarm service (`mongo`, `redis`, `nats`, `seaweedfs`, `prometheus`). Not app train; not part of `release` / `dev-release` |

```bash
# Full local ship after bumping APP_VERSION in .env:
make dev-release

# Day-2 code: full train; digest decides which Swarm roles roll
make rebuild

# Data-layer bounce
make update-data SERVICE=mongo
# Scoped Swarm bake/roll (obs pinned OK when addon deployed)
make rebuild SERVICES=grafana,websocket
```

> PowerShell: `#` starts a comment — run `make dev`, never `make #dev`.

### Ops / escapes - also on `make help-dev`

| Command | Job |
|---------|-----|
| `make advertise` | Redis version nudge only (escape; rarely needed) |
| `make cli ARGS='…'` | Core `tasks` one-shot (also on public help as interactive shell) |
| `make ws-placement-ops` | Cordon / evacuate / ... |
| `make app-version-ops` | Manual Redis version get\|set\|clear |
| `make smoke-ws-placement` | Affinity smoke |
| `make stack-rm` | Remove stack `eip` |

```bash
make cli                         # interactive shell (public)
make cli ARGS='list'             # tasks list (power user)
make cli ARGS='sdeVersion'
```

One-shots call the container `tasks` wrapper for you. Mid-roll: waits until a single `eip_core` owner (fails on pause/rollback/timeout). Override: `EIP_CORE_CONTAINER=…`, `EIP_CLI_WAIT_SEC=180`.

---

## `make swarm-sync` (#32)

```bash
make swarm-sync ARGS='--dry-run'
make swarm-sync
make swarm-sync ARGS='--full-stack'   # escape: rematerialize whole Swarm stack
```

Default path: ephemeral sync-env + targeted `docker service update` (api/websocket/worker capacity,
concurrency/cutoff, Traefik ports/paths, Grafana path). Does **not** flip Redis advertise.
Changing replicas/env/spec **can** roll those containers — that is Docker applying settings, not a
release. Does **not** bounce mongo/redis/nats. Scale by editing `eip.config.yaml` then
`make swarm-sync` (no separate `scale-*` Make targets; automatic scale is **#18**).

## `make swarm-secrets-sync` (#32)

```bash
make swarm-secrets-sync ARGS='--dry-run'
make swarm-secrets-sync
```

Refreshes elastic Swarm secrets from **`.env`** via versioned `docker secret` objects, then
rematerializes the Swarm stack so tasks remount `/run/secrets`. Does **not** apply
`eip.config.yaml` (use `make swarm-sync` for that). Does **not** bounce mongo/redis/nats.
Frontend uses public env only (no secret attach). Remaining #3: `*_API` DB users — see
[ENV.md](./ENV.md) / [BIND_MOUNTS.md](./BIND_MOUNTS.md).

## `make rebuild` (#33) — dev fine-tune

```bash
make rebuild                              # Swarm app train: api,websocket,worker,ws-router,core,frontend
make update-data SERVICE=mongo            # data-layer (not rebuild)
make rebuild SERVICES=traefik,grafana,alloy
make rebuild SERVICES=websocket           # optional scoped Swarm bake/roll
make rebuild SERVICES=core,frontend
make rebuild ARGS='--dry-run'
make rebuild ARGS='--roll-only'           # force roll buildable app even if digest unchanged
make rebuild ARGS='--no-cache'            # optional clean bake (not the default)
```

- **Build:** Swarm via **buildx bake** (#35) group `swarm` (incl. frontend) → stable `:bake`, then promote `${APP_VERSION}-<timestamp>` **per role** whose digest changed; state in gitignored **`.eip-local-build.env`** (`APP_VERSION`, `TAG_*`, `DIGEST_*`). Default = `dev_app_services` only. Cache by default.
- **`SERVICES=`:** Swarm bakeable or pinned (app + obs). Data-layer names are **rejected** → `make update-data SERVICE=…`.
- **Swarm app:** bake to stable `:bake`; promote a **per-role** `TAG_*` only when that role’s `:bake` image digest changes (`docker image inspect` only — no python/node/jq; unchanged roles keep their tag → no Swarm roll). `--no-cache` rebuilds layers only — does not force promote. Roll also skips on same digest (or use `--roll-only`).
- No GHCR publish, no `swarm-sync`, no Redis advertise.

Version bumps that must re-bake every layer: use **`make dev-release` / `make release`** (`--no-cache` there is intentional).

## Bring-up detail

| Command | Swarm |
|---------|--------|
| **`make up`** | GHCR data fragment + app train (api/websocket/worker/ws-router/core/**frontend**) + `traefik:v3` — **no local bake**. Obs addon: `docker-stack.obs.yml` (separate) |
| **`make dev`** | Same fragments; **buildx bake** (incl. frontend) → `:bake` + per-role `TAG_*` promote via `docker-stack.dev.yml` + `.eip-local-build.env` |

Day-2 local image rebuild without full bring-up: **`make rebuild`** (bake for `dev_app_services`).

See [STACK.md](./STACK.md), [NETWORK.md](./NETWORK.md), [TRAEFIK.md](./TRAEFIK.md).

## Releases (#23)

Do **not** use `make up` / `make dev` to ship a new version on a healthy install.

```bash
# Public
make release

# Dev
make dev-release
make dev-release ARGS='--dry-run'
make dev-release SERVICES=api,websocket
```

Order inside `release` / `dev-release` (unattended):

1. Build/pull entire train (`--no-cache` on local)
2. Roll Swarm core (stop-first) before dual-warm
3. Dual-warm Swarm app roles (incl. frontend) to 2R (NEW beside OLD)
4. **Advertise** Redis once
5. Look-ahead cordon + drain OLD -> scale back to R

Playbook: [APP_TRAIN.md](./APP_TRAIN.md).

**Never** bounce mongo/redis/nats as part of an app release.

## Cross-OS smoke (public verbs)

Same Make verbs on **Windows (Git Bash + `make`)**, **Linux**, and **macOS**. Prerequisites: Docker
Engine (Desktop OK), Swarm can init (`make up` ensures it), Git Bash on Windows so `$(BASH)` works.

| Check | Command | Expect |
|-------|---------|--------|
| Help | `make help` | Public list only (no `stack-deploy`) |
| Bring-up | `make up` | Swarm `eip_*` tasks healthy (`make status`) |
| YAML apply | `make swarm-sync ARGS='--dry-run'` then `make swarm-sync` | Summary + targeted updates; no mongo bounce |
| Secrets | `make swarm-secrets-sync ARGS='--dry-run'` | Would rematerialize elastic secrets |
| Status / logs | `make status` / `make logs` | Tables / picker works |
| Scale | Edit `eip.config.yaml` `services.*.min` → `make swarm-sync` | Replica count matches YAML |
| Refresh scripts | `make update-files` | Makefile + whole `scripts/` + observability from Public |
| Stop | `make shutdown` | Stack down; volumes kept |

Dev clone extras: `make help-dev`, `make rebuild ARGS='--dry-run'`, `make smoke-ws-placement`.

## Related

- [APP_TRAIN.md](./APP_TRAIN.md) - dual-warm -> advertise -> drain OLD
- [ENV.md](./ENV.md) - secrets vs operator YAML
- [WS_ROUTER.md](./WS_ROUTER.md) - placement / prefer-newest / `ws-placement-ops`
- [WEBSOCKET.md](./WEBSOCKET.md) - drain / cutoff
- [DEPLOYMENT.md](../../DEPLOYMENT.md) - public install guide
