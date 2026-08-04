# Mongo rebuild rules (`shared/mongo`)

**Not live SoT.** Binding process for the Stage B rebuild (2026-08-02). Supersedes the earlier “gradual Plan B / touch-as-you-go” cutover for how we land code.

**Rules ack:** Following [`../documentation-rules.md`](../documentation-rules.md) + [`../technical-rules.md`](../technical-rules.md). Live SoT untouched until promote. Product comments = current behaviour only.

## Intent

**Full clean rebuild** under **`services/shared/mongo`** (`Store` / `Docs` / `Bulk`). Do **not** mirror legacy API shape (no collection-passing compat wrappers). Legacy `shared/core/mongo` is a **behaviour oracle for tests only** so data/results stay the same when call sites switch. Fold in v2 extras and clearer Go freely; parity gates **outcomes**, not call signatures.

## Hard rules

1. **New home only** — rebuild work lands in `eve-industry-planner/shared/mongo`. Do **not** add features to `shared/core/mongo`.
2. **Clean API** — design for `Store` / `Docs` / `Bulk`. Do **not** add legacy-shaped facades “for easier migration.”
3. **Legacy is read-only oracle** — used in `TestParity_*` (and production until a call site flips). Bugfixes that must ship on legacy may patch it; mirror behaviour into `shared/mongo` if that surface already exists there.
4. **Parity before swap** — same inputs → same results/errors (data unchanged). API may differ (`store.Docs(name).GetPrivateByID` vs `GetPrivateDocumentByID(ctx, coll, …)`). No production import flip without green parity for that behaviour.
5. **Intentional deltas are explicit** — overlay + allowlist if new code may differ. Default is **exact match** on outcomes.
6. **Switch call sites to the clean API** when parity is green — rewrite the call, don’t keep old signatures.
7. **v2 / Go extras welcome** — `Client.BulkWrite`, `errors.Is`, etc., as long as parity holds.
8. **Delete legacy only at zero imports** — after the sweep is clean.

## Parity test conventions

| Item | Convention |
|------|------------|
| Location | `package mongo_test` under `shared/mongo` (or `shared/mongo/parity` if the suite grows) |
| Imports | `legacy "eve-industry-planner/shared/core/mongo"` + `eipmongo "eve-industry-planner/shared/mongo"` |
| Production code | **`shared/mongo` must not import `shared/core/mongo`** (avoids cycles; oracle only in tests) |
| Pure helpers | Same args → deep-equal outs + `errors.Is` / equal error text where stable |
| Wire helpers | Prefer offline (filters, BSON, IDs). Live DB only when unavoidable; then shared fixture + compare both paths |
| Handlers (later) | Same HTTP request → same status + comparable JSON body (normalize volatile fields: times, ObjectIDs) against old handler or old service func |

Name tests `TestParity_<Surface>_…`. When legacy file is deleted, delete the matching parity tests.

## Live / fixture documents (deeper parity)

Use the running stack Mongo to deepen tests beyond synthetic cases.

| Mode | How |
|------|-----|
| **Export** | `services/cmd/mongo_parity_sample` → `.tmp/mongo-parity/*.json` (already gitignored via `/.tmp/`) |
| **Offline after export** | `go test ./shared/mongo/ -run Parity_realDocs` loads fixtures if present; else skip |
| **Live** | Cross-compile test binary + `EIP_MONGO_PARITY_LIVE=1` on `eip-core` (same pattern as smoke). Covers `Parity_realDocs`, `Parity_live_get*`, `Parity_live_putGet*`, `Parity_live_LoadJobsByFilter_*` (handler shapes, account-scope delta, Docs-layer omit-account slip), `Parity_live_docShape_*`, `Parity_live_schemaUpgrade_*` |
| **Call-site live** | Same gate on `api/helper` (`-run Live`): login resolve, user/settings, watchlist, job/group put/get/list/delete, group membership deltas. Scratch `eip-api-live-account`. Inventory → [`testing/services/api.md`](../../testing/services/api.md) |

**Live re-run (PowerShell, from `services/`):**

```text
set GOOS=linux& set GOARCH=amd64& set CGO_ENABLED=0
go build -o ../.tmp/mongo_parity_sample ./cmd/mongo_parity_sample
go test -c -o ../.tmp/mongo_parity.test ./shared/mongo/
docker run --rm --network eip-core --env-file ../.env -e MONGO_HOST=mongo -e MONGO_PORT=27017 -e MONGO_PARITY_LIMIT=50 -e MONGO_PARITY_OUT=/out/mongo-parity -v %CD%/../.tmp:/out -v %CD%/../.tmp/mongo_parity_sample:/sample:ro --entrypoint /sample alpine:3.20
docker run --rm --network eip-core --env-file ../.env -e MONGO_HOST=mongo -e MONGO_PORT=27017 -e EIP_MONGO_PARITY_LIVE=1 -v %CD%/../.tmp/mongo_parity.test:/parity.test:ro --entrypoint /parity.test alpine:3.20 -test.v -test.run Parity_live_|Parity_realDocs
```

Doc-shape tests assert the **stored** document (not only decoded structs): submitted fields, `_meta` stamps, job root `$unset`, and preserving-meta rules (session/`createdAt` kept; `clientID` from incoming applied — same as legacy `applyLastModified`).

**Rules:** do **not** commit sample dumps (account/job data). Export strips a few obvious token fields; treat dumps as sensitive. Put scratch docs use `_meta.accountID=eip-parity-account` and are deleted after the test.

## Rebuild order (aggressive, parity-gated)

See [`stage-b-full-move.md`](./stage-b-full-move.md). Short form:

0. Package + Mongo/Bulk (done)  
1. Spine: connect, bson, retry, names/unset — **parity** (done)  
2. Helpers via **`Docs`** + archive/delete — **parity** (done)  
3. put/get on Docs — **parity** (done)  
4. Multi-coll callers on `mongo.Bulk()` (done: build_stats + grouptemplates)  
5. Flip production imports (done — type `Mongo`, Docs fields, `mongo.…` call chains)  
6. Remove `shared/core/mongo` (**deferred** — still present as oracle)

## Done when (rebuild)

- [x] Parity suite covers dual-homed helpers (legacy kept for oracle tests)  
- [x] Production call sites on `shared/mongo`  
- [ ] `shared/core/mongo` removed  
- [ ] Overlay describes Mongo + Bulk + package home for promote  

## Production naming (current)

| Piece | Name |
|-------|------|
| Type | `eipmongo.Mongo` |
| Connect bag | `clients.Mongo *eipmongo.Mongo` |
| Call chain | `mongo := clients.Mongo` then `mongo.JobDocuments.…` |
| Docs | Fields on `Mongo` (`JobDocuments` ≠ `Jobs`) |
| Driver import | `mongodriver` when handle is `mongo` |
