# The image, layer by layer

Measured 2026-09-15 against `eve-industry-planner-frontend`, baked from the dev stack.

`docker images` reports 314 MB where the layers sum to 241 MB. The difference is the containerd
snapshotter counting the compressed blobs it also keeps alongside the unpacked snapshot, so three
numbers describe one image and only two of them mean anything: **241 MB unpacked on disk**, **57 MB
pulled**. Quote the one that matches the cost being argued about.

## Before

| Layer | Size |
|-------|------|
| alpine rootfs | 9.1 MB |
| node 24 runtime (`node` binary 125 MB, npm 18.8 MB, headers 6.6 MB) | 162 MB |
| yarn 1.22 | 5.5 MB |
| `COPY /app/dist` | 32.1 MB |
| `COPY frontend/deployment` | 0.04 MB |
| `RUN addgroup … && chown -R appuser /app` | 32.2 MB |

The last row is the whole of `dist` written a second time: the user was created after the copies, so
the recursive `chown` rewrote every file into a new layer.

## After the two fixes

| Layer | Before | After |
|-------|--------|-------|
| `COPY /app/dist` | 32.1 MB | 4.15 MB |
| user creation | 32.2 MB | 0.041 MB |

**314 MB → 242 MB reported; 241 MB → 179 MB unpacked.** The `dist` drop is source maps: 160 `.map`
files totalling 24.7 MB against 4.3 MB of actual application. They were also being served publicly.

## What is left, and the floor

Of the 179 MB that remains, 176 MB is the base image — and 125 MB of that is the `node` binary,
present to serve 4 MB of static files.

A probe of `alpine:3.24` + `libstdc++` + the `node` binary copied from `node:24-alpine` runs and
measures 143 MB, against 176 MB for the full base. So the cheapest available step without replacing
the server is about 33 MB.

## Pull size and runtime footprint

| Image | Pulled |
|-------|--------|
| `eve-industry-planner-frontend` | 57 MB |
| `eve-industry-planner-ws-router` (Go, alpine) | 12 MB |

Resident memory, `docker stats` on the running dev stack:

```
eip_frontend.1            24.66 MiB
eip_capacity-controller.1 25.26 MiB
eip_ws-router.1           16.51 MiB
```

**Node is not the memory cost it was assumed to be.** It idles in the same band as the Go services,
so memory is not an argument for replacing it and should not be offered as one. The arguments that
survive measurement are pull size, disk, and what is installed in an internet-facing container.
