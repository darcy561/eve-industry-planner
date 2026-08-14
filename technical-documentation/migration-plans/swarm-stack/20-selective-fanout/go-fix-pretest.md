# go fix -diff pretest (#20 touch surface)

**Rules:** migration [`technical-rules.md`](../../technical-rules.md) — run on **planned packages only** before feature work; do not widen into unrelated siblings.

Recorded 2026-08-07 (decision-pack lock). Safe modernizers applied same day where listed. Re-run on edited packages after each implement slice.

**Watcher / publisher cutover:** [implement-watcher-cutover.md](./implement-watcher-cutover.md) — hand-edit only; this pretest does **not** authorize package-wide `go fix` on `watcher.go`.

## In scope

| Path | Role in #20 |
|------|-------------|
| `services/shared/core/nats/` | `UpdateConsumerFilterSubjects`; GetOrCreateConsumer fan-out path |
| `services/websocket/server/` (fan-out / hosted / nats_*) | Filter controller + subject/payload parse (coupled to publisher) |
| `services/websocket/server/natslogic/` | Consumer config |
| `services/websocket/server/identity/` | Durable names (read; naming done) |
| `services/core/changestream/` | `doc.update` subject cutover — see [implement-watcher-cutover.md](./implement-watcher-cutover.md) |
| `services/shared/core/documentlock/publish.go` | Lock tenantString publish → document-lock roadmap (not #20) |

## Results

| Path | `go fix -diff` | Status |
|------|----------------|--------|
| `shared/core/nats/jetstream.go`, `constants.go`, `messages.go` | Clean | — |
| `shared/core/nats/stream_consumer_reconcile.go` | `for range maxPasses` | **Applied** 2026-08-07 (style only) |
| `shared/core/nats/nats.go`, `consumer_context.go` | `any` / `min` / `for range` | **Applied** 2026-08-07 (style only) |
| `core/changestream/bson_doc.go` | `interface{}` → `any` | **Applied** 2026-08-07 (style only) |
| `websocket/server/hosted_tenants.go`, `identity/` | Clean | — |
| `websocket/server/nats_subscriptions.go`, `nats_doc_lock.go`, `natslogic/consumers.go` | No in-file hunks (package scan pulled dependency noise) | Re-diff when editing (parse/filter slices) |
| `core/changestream/watcher.go` | Import / `maps` churn if package-fixed | **Hand-edited** subject cutover (2026-08-08); did not package-auto-fix |
| `shared/core/documentlock/publish.go` | Clean | — |

Style-only applies above do **not** change JetStream subjects, filters, or delivery.

## Explicitly out of scope (do not apply)

- `go fix ./core/changestream/` (or accepting a full package auto-diff for `watcher.go`)
- `shared/core/objectstore/s3.go` — dependency noise
- Whole `services/` or `deployment-tool/` trees
- Unrelated websocket `sync/`, SPA, etc.

## After each implement slice

Re-run `go fix -diff` on **packages/files actually edited** in that slice only; empty diff = done for modernizers.
