# #26 — WebSocket connection / affinity simulator

**Roadmap:** [../roadmap.md](../roadmap.md) `#26`  
**Status (mirror):** **done** — hold + limits + co-location fail-on-split  
**Live SoT:** [testing/services/websocket.md](../../../testing/services/websocket.md) § Ops soak. Code: `services/testing/ws_soak` (`main.go` + `lib`/`soaklib`).

## What changed

| Claim | Code / doc |
|-------|------------|
| Hold soak + reconnect | `testing/ws_soak -profile hold` |
| Soft/hard + divert soak | `-profile limits` (NATS soft/full + place off soft / not-on-full) |
| Combined multi-group + soft/hard | `-profile pressure` — sticky account/corp/alliance groups hold while fill corp hits soft→full; divert asserts; scale via `-clients`/`-groups`/`-group-size` |
| Co-location assert | `-require-coloc` (default true): shared affinity keys must not split backends |
| Place observation | `connected.container_id` + NATS soft/full |
| Read-idle false closes | Fixed (`errors.As` timeout); default `-read-idle=2m` |

## How this part works after the change

Build `testing/ws_soak` (**linux** binary for docker), run on `eip-core`. Shared-corp hold:

```bash
# from services/, stack up (GOOS=linux GOARCH=amd64 on Windows hosts)
go build -o ../.tmp/ws_soak ./testing/ws_soak
docker run --rm --network eip-core --env-file ../.env \
  -e REDIS_HOST=redis -e REDIS_PORT=6379 -e NATS_URL=nats://nats:4222 \
  -v "$PWD/../.tmp/ws_soak:/ws_soak:ro" --entrypoint /ws_soak alpine:3.20 \
  -profile hold -affinity corp -corp 910001 -clients 30 -duration 1m
```

Pressure (sync lowered thresholds first, e.g. `target_clients: 40`, `client_cutoff: 80`):

```bash
docker run … /ws_soak -profile pressure -expect-target 40 -expect-cutoff 80 \
  -groups 12 -group-size 15 -clients 400 -duration 5m
```

## Still open

None for #26. Scripted mid-soak kill/evacuate recovery → **#29** (with #21 controller ops).

## Notes / decisions

`-require-coloc=false` disables the assert (endurance-only). Kill/recover drills need controller ops surface (#21/#18), not this harness alone.
