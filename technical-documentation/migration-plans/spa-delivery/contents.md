# SPA delivery

## Owns

How the built SPA reaches a reader: the container that serves it, the headers that tell the browser
and Cloudflare what to keep, and what a deployment does to someone already holding the previous
build.

- **The frontend image** — what is installed in it, what `dist` carries, and the Go static server
  that replaces the Node runtime at `services/spa-server`.
- **The cache tiers** — which files are immutable, which must never be held at the edge, and the
  browser/edge split the API already uses and the frontend does not.
- **Compression** — moving it from per-request work to a build-time pass.
- **Release safety** — what happens to a reader running an hour-old shell whose chunks the new
  container no longer has.
- **Stack citizenship for the frontend service** — maintenance mode, structured logs and traces, and
  the runtime config inlined into the shell.

**Not live SoT** until this project is complete and promotion is approved.

Named for the **work**, not a git branch. **Project close** = plan stages done + live-SoT **promote**
(go-ahead).

## Does not own

- **What Vite emits.** Bundle size, chunking and the dependency graph are untouched; this project
  changes delivery, not the build's output.
- **Application logic.** No behaviour follows the server into `services/` — location-name resolution
  stays client-side, planners stay private, public ESI data stays with the API. See
  [plan.md](./plan.md) § What this project does not do.
- **What maintenance mode is**, which is live SoT →
  [backend/maintenance-mode.md](../../backend/maintenance-mode.md). This project owns only the
  frontend service becoming a participant in it.
- **The API's own cache headers**, which already carry the browser/edge split this project borrows →
  live `services/api`.
- **Cloudflare dashboard configuration.** Cache Rules are not held in this repository; the plan names
  the decision and its cost, and stops there.
- **Traefik routing and TLS** → [stack/traefik.md](../../stack/traefik.md).

## Task map

| I need to… | Read |
|------------|------|
| Goals, stages, done-when, open questions | [plan.md](./plan.md) |
| Know what already landed and what is still open | [plan.md](./plan.md) § Already landed, § Stages |
| Know why the server moves to `services/` but the SPA does not | [plan.md](./plan.md) § Naming |
| Know what is additive, breaking, or migrate-required | [plan.md](./plan.md) § Wire compatibility |
| See where the image's 242 MB actually is | [measurements/image.md](./measurements/image.md) |
| Argue about Node's memory cost before repeating an assumption | [measurements/image.md](./measurements/image.md) § Pull size and runtime footprint |
| See what Cloudflare is really caching, and what it is not | [measurements/edge-cache.md](./measurements/edge-cache.md) |
| Know why hashed assets were revalidating hourly | [measurements/compression.md](./measurements/compression.md) § Filenames |
| Size the cost of compressing on every request | [measurements/compression.md](./measurements/compression.md) |
| Read how the delivery path behaves after a landed slice | [overlay.md](./overlay.md) |
