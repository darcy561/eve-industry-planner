# SPA delivery — behaviour overlay

How the delivery path works **after** each slice lands. Live docs remain the truth wherever this file
is silent; where it speaks, it wins for this project's in-flight work.

Sections are written as their stage lands, not in advance — an overlay describing work that has not
happened is a plan, and the plan is [plan.md](./plan.md). A section marked *uncommitted* describes
code that exists in the working tree and not yet in history.

## The image

*Stage A — written, uncommitted.*

The runtime stage creates `appuser` before anything is copied in, and both copies carry
`--chown=appuser:appuser`. A recursive `chown` over `/app` after the copies would rewrite every file
of `dist` into a second layer of the same size, which is what the image carried before.

`/app` itself stays `root:root` at the 0755 `WORKDIR` gives it, which `appuser` traverses. The only
path written at runtime is `dist`, where the startup script generates `env.js`, and that is owned by
`appuser`.

Source maps are built `hidden`, uploaded to Sentry by the Vite plugin during the build, and deleted
before the runtime stage copies `dist`. The deletion is unconditional rather than gated on
`SENTRY_AUTH_TOKEN`, which the Deployment Tool documents as optional: gating it would mean an operator
building without Sentry ships 25 MB of source maps and serves their unminified source.

Nothing in the shipped bundle carries a `sourceMappingURL` comment, so no reader requests a map that
is not there.

## Cache tiers

*Stage A — written, uncommitted. Stage C will add the CDN tier.*

`cacheControlFor` in `frontend/deployment/server.js` owns the rule, and is the only place that decides
it. A file is treated as versioned when its name ends `-<hash>.<ext>` with at least eight base64url
characters — the shape Vite writes. Matching the suffix rather than searching the name for hex is what
makes the rule correct, and the anchoring is also what keeps `env.js` out of the immutable tier.

| Served | Cache-Control |
|--------|---------------|
| `<name>-<hash>.js` / `.css` | `public, max-age=31536000, immutable` |
| Images, fonts, favicons by extension | `public, max-age=31536000, immutable` |
| Everything else, including `env.js`, `index.html`, `health.json` | `public, max-age=3600, stale-while-revalidate=86400` |

Only `Cache-Control` is sent today, so browser and edge share one number. Stage C adds the
`CDN-Cache-Control` / `Cloudflare-CDN-Cache-Control` split the API already uses.

## Release safety

*Stage B — not started.*

## Precompression and the Go server

*Stage D — not started.*

## Maintenance mode, telemetry and inlined config

*Stage E — not started.*
