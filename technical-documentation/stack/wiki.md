# Wiki

Live SoT for Swarm service `eip_wiki` (app fragment [`docker-stack.yml`](../../docker-stack.yml)): Otter wrapper image, Host, settings volume. Bake → [`docker-bake.hcl`](../../deployment-tool/internal/images/docker-bake.hcl) target `wiki`. Edge routing → [traefik.md](./traefik.md). Overlay membership → [network.md](./network.md). In-app URLs / theme cookie → [frontend wiki](../frontend/wiki.md).

## Image & defaults

| Piece | Default | Change |
|-------|---------|--------|
| Otter Wiki base | `redimp/otterwiki:2-slim@sha256:946e55ee7c5fb217743c4ab7d3fd4d5cab924491b7e79b6bb250126b9939e61f` | [`docker/wiki/Dockerfile`](../../docker/wiki/Dockerfile) `FROM` (`@sha256:…` required) |
| Wiki image (live) | `ghcr.io/darcy561/eve-industry-planner-wiki:${WIKI_COMPAT_TAG}` | [`docker-stack.yml`](../../docker-stack.yml) `services.wiki.image` |
| `WIKI_COMPAT_TAG` | Public `X.Y.Z` → `X.Y`; otherwise full `.env` `APP_VERSION` | [`wiki_vars.go`](../../deployment-tool/internal/stack/wiki_vars.go) `WikiCompatTag` |
| Wiki image (dev) | `eve-industry-planner-wiki:${TAG_wiki}` | [`docker-stack.dev.yml`](../../docker-stack.dev.yml) |
| Replicas | `1` | stack YAML `x-wiki-deploy` |
| Update order | stop-first | same (SQLite) |
| Volume | `eve-industry-planner_otterwiki_db` → `/app-data/db` | [`docker-stack.yml`](../../docker-stack.yml) `volumes` / `services.wiki.volumes` |
| Listen | `8080` (uwsgi `http-socket`) | Upstream Otter image |
| Host | `wiki.${EIP_WIKI_HOST}` | [`wiki_vars.go`](../../deployment-tool/internal/stack/wiki_vars.go) `WikiHost` (live = hostname of `.env` `EVE_CALLBACK_URL`; Expand `source=dev` → `localhost`). Live Expand fails if the callback has no host |
| Read / write | anonymous read; `WRITE_ACCESS=ADMIN`; registration disabled | stack YAML `services.wiki.environment` |

## Topic wiring

```text
wiki/ + custom.css/js     COPY into image (pages git repo + theme)
/app-data/db              named volume (settings.cfg + sqlite) — not in the image

Traffic (eip-public)
  Host(`wiki.${EIP_WIKI_HOST}`)  →  eip_wiki :8080   (web + websecure)
```

Live needs DNS for `wiki.{host}` and a TLS certificate that covers that name (SAN or wildcard).
