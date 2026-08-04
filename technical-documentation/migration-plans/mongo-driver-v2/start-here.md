# Start here — MongoDB Go driver v1 → v2

**Handoff status (2026-08-02):** **Stage A shipped.** Stage B production cutover to `services/shared/mongo` **landed** (type `Mongo`, Docs fields, `clients.Mongo`, call chains `mongo.…`). Legacy `shared/core/mongo` **kept for now** (oracle / unused by production). Bulk adopters: grouptemplates + `process_build_stats`. Rules: [`rebuild-rules.md`](./rebuild-rules.md). Next: stack smoke after image roll; later delete legacy; revisit handler `clients` signatures. Promote live SoT only with go-ahead. Deployment Tool Mongo ensure is **out of scope**.

**Rules:** Read [`../documentation-rules.md`](../documentation-rules.md) + [`../technical-rules.md`](../technical-rules.md) + [`rebuild-rules.md`](./rebuild-rules.md). Overlay wins on overlap. Do not edit live SoT until promote go-ahead.

**Doc sync:** After each rebuild wave, update [`plan.md`](./plan.md), [`overlay.md`](./overlay.md), [`stage-b-full-move.md`](./stage-b-full-move.md), and this handoff — same day as the code.

## Recommended pickup order (now)

1. Re-run live parity on `eip-core` + manual smoke (login, job-documents, groups) after rolling app images.
2. Delete `shared/core/mongo` when ready (parity tests retarget to new-path-only).
3. Optional: thin handler signatures (`mongo *eipmongo.Mongo` without `clients` where only mongo is needed).
4. Promote live SoT only with go-ahead.

## Live docs / code (truth where no overlay)

| Topic | Where |
|-------|--------|
| Stack Mongo image / data fragment | [`docker-stack.data.yml`](../../../docker-stack.data.yml), [`../../stack/contents.md`](../../stack/contents.md) |
| Day-2 ensure / deploy | [`../../deployment/deployment-tool/cli/deploy.md`](../../deployment/deployment-tool/cli/deploy.md) (`eip ensure-mongo`) |
| Mongo access (production) | `services/shared/mongo` — type `Mongo`, Docs fields |
| Mongo oracle (legacy, unused by prod) | `services/shared/core/mongo` |
| Changestream | `services/core/changestream` |
| Official driver migrate | [migration-2.0.md](https://github.com/mongodb/mongo-go-driver/blob/master/docs/migration-2.0.md) |

## Still open

- [x] Stage A on dev  
- [x] Rebuild rules + parity harness  
- [x] Wave 1 spine in `shared/mongo` + parity tests  
- [x] Helpers / put / get surfaces + live parity  
- [x] Production import flips (`clients.Mongo` → `*eipmongo.Mongo`, `mongo.…` call chains)  
- [x] Bulk multi-coll (grouptemplates, process_build_stats)  
- [ ] Delete `shared/core/mongo`  
- [ ] Promote live SoT (explicit go-ahead)  
