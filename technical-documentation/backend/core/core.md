# Core service (`eip_core`)

Live SoT for the **core** control-plane service (schedulers, changestream, nested singletons). Code: [`services/core`](../../../services/core/).

## Image & defaults

| Piece | Default | Change |
|-------|---------|--------|
| Image | `ghcr.io/darcy561/eve-industry-planner-core:${APP_VERSION}` | [`docker-stack.yml`](../../../docker-stack.yml) `services.core.image` |
| Replicas | `1` | stack YAML `deploy.replicas` |
| Update order | `start-first` (monitor `45s`, delay `10s`) | stack `deploy.update_config` |
| `stop_grace_period` | `60s` | stack YAML |
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

**A document carrying invalid UTF-8 does not publish.** Encoding the message payload refuses a string
that cannot be represented — see [shared/jsoncodec.md](../shared/jsoncodec.md) — so the watcher logs
the failure and the write to the changed document produces no `doc.update` message. A client watching
that document goes stale rather than receiving mangled text.

Lock notifications are published by the API/document-lock path (`doc.lock.{accountID}`), not by this changestream subject shape.

## Triggering a task

An operator runs a worker task by name through `eip cli` → [verbs.md](../../deployment/deployment-tool/cli/verbs.md):

```bash
eip cli tasks list
eip cli tasks checkSdeUpdates
eip cli tasks applySdeVersion --version=3272045
```

`tasks list` prints what is runnable, with each command's worker task name, subject and default queue.

**A task is runnable because it is listed, not because it exists.** `dispatchTable` in
[`core/commands/tasks.go`](../../../services/core/commands/tasks.go) is the allowlist: one entry per
command, holding what an operator types, the task definition it names, and the call that publishes
it. The registry may hold a task that has no entry, and that task is not reachable from the command
line.

**Each entry publishes through the task's own helper**, not through a subject and a payload assembled
here. A command therefore cannot queue a request in a shape the handler does not take, and the flags
a task needs are its entry's business — `applySdeVersion` refuses without `--version` before anything
is published.

Adding a task to the operator surface is one entry. A command name that differs from the worker task
name is part of that entry rather than a second mapping to keep in step.

**Commands that run in the process rather than publishing** are a second allowlist, `cliTable`,
alongside the first. These act directly — reporting SDE versions, purging worker queues, toggling
[maintenance mode](../maintenance-mode.md), running release steps — and each entry declares its own
flag summary. The usage text and `tasks list` are both built from the two tables, so a command
reaches them by being runnable rather than by being remembered — nothing lists a command separately
from the table that runs it.

## Health

| Endpoint | Role |
|----------|------|
| `GET :19100/healthy` | Liveness |
| `GET :19100/ready` | Standby handoff-ready for Swarm replace |

No Traefik route.
