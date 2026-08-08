# Implement — watcher / `doc.update` publisher cutover

**Roadmap:** #20 — Selective fan-out  
**Outcome SoT:** [subjects-doc-update.md](./subjects-doc-update.md)  
**go fix:** [go-fix-pretest.md](./go-fix-pretest.md) — do **not** package-auto-fix `watcher.go`; optional `any` / `maps.Copy` only in the hand edit  
**Cursor plan name:** `selective_fanout_watcher_cutover_7a3c1e2b` (same checklist)

## Status

**Landed (2026-08-08)** with filter helper + WS controller + publisher subject cutover + WS payload parse in one train. Coverage: `shared/core/nats` live JetStream tests + `websocket/server` `TestIntegrationSelectiveFanoutHostPullsNonHostDoesNot`. **Live SoT promoted** same day ([../promote/](../promote/); [websocket.md](../../../../backend/websocket/websocket.md)).

## What changed (product)

| | Before | Landed |
|---|--------|--------|
| Subject | `doc.update.{collection}.{docID}` | `doc.update.{tenantString}.{collection}.{docID}` |
| Tenant | JSON payload only | Subject token + payload (payload fields unchanged) |
| WS filter | `doc.update.>` firehose | `doc.update.{tenantString}.>` per hosted tenant |
| WS parse | `ExtractIDFromSubject` → `{collection}.{docID}` | Payload `collection`/`docID` preferred (tenant not part of doc id) |

Safe `go fix` already applied on `shared/core/nats` + `bson_doc.go` does **not** change subjects or delivery.

## Gates before publisher edit

1. `UpdateConsumerFilterSubjects` (+ GetOrCreateConsumer fan-out path does not recreate on every filter change)
2. WS debounced filter controller from local `HostedTenants`
3. Same release: WS subject/payload parse fix (see below)

## Tenant resolution

Use [`wsplacement`](../../../../services/shared/wsplacement/tenant.go) encoding. Precedence matches dispatch today:

1. `accountID` → `account:{id}`
2. else `corporationID` → `corporation:{id}`
3. else `allianceID` → `alliance:{id}`
4. else **no publish** (metric/log) — no legacy subject, no catch-all tenant token

Verify `:` in the tenant token is fine for JetStream in this stack; if not, reopen subjects Outcome (do not silently hash).

## Hand-edit checklist

1. Resolve `tenantString` after account/corp/alliance extraction in [`watcher.go`](../../../../services/core/changestream/watcher.go)
2. Build `doc.update.{tenantString}.{collection}.{docID}`; payload `Subject` = publish subject
3. Log tenant string; keep routing JSON fields as today
4. Optional same edit: `any` / `maps.Copy` only — no `go fix ./core/changestream/`
5. Refresh `SubjectDocUpdate` format comments in [`constants.go`](../../../../services/shared/core/nats/constants.go)
6. Coupled WS: prefer payload `collection`/`docID` for enqueue/shard; or `ParseDocUpdateSubject` with colon-tenant tests
7. Unit tests for subject shape + missing tenant; smoke hosting vs non-hosting pull
8. Re-run `go fix -diff` on **edited files only**

## Out of this slice

- Blind `go fix` on changestream package
- `doc.lock` tenantString → [document-lock roadmap #32](../../../backend/api/document-lock/roadmap.md) (not this pack)
- Census, filter-controller internals (sibling slices; required only as release gate)
