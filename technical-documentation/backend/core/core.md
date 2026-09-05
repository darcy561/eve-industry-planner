# Core service (`eip_core`)

Live SoT for the **core** control-plane service (schedulers, changestream, nested singletons). Code: [`services/core`](../../../services/core/).

## Image & defaults

| Piece | Default | Change |
|-------|---------|--------|
| Image | `ghcr.io/darcy561/eve-industry-planner-core:${APP_VERSION}` | [`docker-stack.yml`](../../../docker-stack.yml) `services.core.image` |
| Replicas | `1` | stack YAML `deploy.replicas` |
| Update order | `start-first` (monitor `45s`, delay `10s`) | stack `deploy.update_config` |
| `stop_grace_period` | `60s` | stack YAML |
| Volume | `core_data` → `/data` | stack YAML |
| Networks | `eip-core` only | [network.md](../../stack/network.md) |

Secret attach: `x-secrets-core`. Full service block → `services.core` in that YAML.

## Primary lease (summary)

| Piece | Live rule |
|-------|-----------|
| Lease | Redis `lease:core:primary` — who may run scheduler + changestream |
| Controllers | `primarycontroller` + `servicemanager` |
| Swarm healthcheck | `GET :19100/ready` = **handoff-ready standby** (deps + election loop) — must **not** require holding the lease |
| Roll | `start-first`: new Healthy → SIGTERM old → old releases lease → new acquires |
| Changestream resume | Redis `eip:core:handoff:v1:cs:resume:{groupID}` |

Expand this section later (sequence, workload gating, nested singleton leases).

## Changestream → JetStream (`doc.update`)

Primary-only watchers publish document changes to JetStream stream `doc-update-stream`:

| Piece | Live rule |
|-------|-----------|
| Subject | `doc.update.{tenantString}.{collection}.{docID}` |
| `tenantString` | The document's owner key, `kind:id` — the same string websocket hosted / placement keys use |
| Missing tenant | No publish (no legacy subject, no catch-all token) |
| Payload | Carries `ownerKey`, collection and docID. The websocket parses the key back into an owner and switches on its kind |
| Consumers | Websocket durables filter by hosted tenant — [websocket.md](../websocket/websocket.md) § JetStream doc fan-out |

The owner is read from `_meta.owner` on the changed document. A delete without a preimage states no
owner, so the message routes to explicit subscribers rather than an owner's clients — singleton account
documents recover it from the `_id`, which is the account id.

Lock notifications are published by the API/document-lock path (`doc.lock.{accountID}`), not by this changestream subject shape.

## Health

| Endpoint | Role |
|----------|------|
| `GET :19100/healthy` | Liveness |
| `GET :19100/ready` | Standby handoff-ready for Swarm replace |

No Traefik route.
