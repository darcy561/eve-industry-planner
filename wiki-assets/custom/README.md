# Otter Wiki custom assets

Baked into `eve-industry-planner-wiki` at `/app/otterwiki/static/custom/`. Otter loads `custom.css` and `custom.js` from that path. This folder sits outside `wiki/` so Otter does not treat it as a wiki page.

| File | Role |
|------|------|
| `custom.css` | Stub. Otter still uses default Halfmoon styling. |
| `custom.js` | Syncs Otter Halfmoon theme with the `eip-theme` cookie (shared across subdomains). |

Theme cookie → [`technical-documentation/frontend/wiki.md`](../../technical-documentation/frontend/wiki.md). Image pin and COPY layout → [`technical-documentation/stack/wiki.md`](../../technical-documentation/stack/wiki.md).
