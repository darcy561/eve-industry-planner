# Live smoke notes — Stage A

**Not live SoT.** Filled A4 **2026-08-02**.

| Check | Result | Notes |
|-------|--------|-------|
| Connect / ping | **pass** | `mongocore.ConnectFromMongoEnv` + `Ping` via driver v2.8.0 |
| One read/write path | **pass** | Insert / Find (nested `_meta` as `bson.M`) / Update / Delete on temp collection `_mongo_driver_v2_smoke` (dropped after) |
| Changestream resume / cold-start | **pass** | Cold watch on smoke collection; saw `insert` event (UpdateLookup) |
| Archived-job `Distinct` (if easy) | **pass** | `Distinct("_meta.accountID").Decode` on smoke docs |

**Environment:** local Swarm host; data + app fragments up (`eip_mongo` healthy). Smoke binary attached to **`eip-core`** with `MONGO_HOST=mongo` `MONGO_PORT=27017` and repo `.env` credentials.

**How to re-run**

```text
cd services
set GOOS=linux
set GOARCH=amd64
set CGO_ENABLED=0
go build -o ../.tmp/mongo_v2_smoke ./cmd/mongo_driver_v2_smoke
docker run --rm --network eip-core --env-file ../.env -e MONGO_HOST=mongo -e MONGO_PORT=27017 -v %CD%/../.tmp/mongo_v2_smoke:/smoke:ro --entrypoint /smoke alpine:3.20
```

Harness: `services/cmd/mongo_driver_v2_smoke`.

**App images:** Smoke used a cross-compiled harness first; afterward **dev bake/rebuild** rolled Swarm app images. **2026-08-02:** frontend fetching data on that stack (operator-confirmed).
