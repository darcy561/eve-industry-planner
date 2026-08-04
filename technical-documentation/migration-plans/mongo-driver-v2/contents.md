# MongoDB Go driver v1 → v2

**Status: closed (2026-08-04).** Cutover + access layer landed; live SoT promoted. This folder is **history only** — not operator SoT.

## Owns

Closed migration log for the `services/` MongoDB Go driver v1→v2 move and Stage B access layer.

## Does not own

- Live Mongo / handler wiring → [`../../backend/shared/mongo.md`](../../backend/shared/mongo.md), [`../../backend/api/deps.md`](../../backend/api/deps.md), [`../../backend/worker/worker.md`](../../backend/worker/worker.md)
- Shared / API test depth → [`../../testing/services/shared.md`](../../testing/services/shared.md), [`../../testing/services/api.md`](../../testing/services/api.md)
- Day-2 EnsureMongo → [`../../deployment/deployment-tool/cli/deploy.md`](../../deployment/deployment-tool/cli/deploy.md)

## Task map

| I need to… | Read |
|------------|------|
| What landed / deferred | [history.md](./history.md) |
| Current Mongo behaviour | [`../../backend/shared/mongo.md`](../../backend/shared/mongo.md) |
| Current API deps wiring | [`../../backend/api/deps.md`](../../backend/api/deps.md) |
| Re-run optional live smoke | `services/cmd/mongo_driver_v2_smoke` |
| Optional live parity tests | `EIP_MONGO_PARITY_LIVE=1 go test ./shared/mongo/ -run Live` (from `services/`) |
