# Static data delivery

## Owns

What a converted SDE build leaves behind, and every step between that and a value read during a
render: the published object layout, the version manifest, the headers and URLs the files are served
under, what Cloudflare does with them, and which files the SPA downloads at all.

- **The published layout** — content-addressed objects and one manifest, in place of a mutated
  `live_data/` directory with labelled snapshots beside it.
- **The version contract** — what `/api/static-data/meta` says a build is, and whether a file's
  version is the build's or its own.
- **The serve path** — the API's process cache, the per-request work done for each reader, and
  compression moved to publish time.
- **The edge** — why `/api/static-data/*.json` is not cached by Cloudflare today, and what makes it
  cacheable.
- **The shape of the files** — indentation, ids repeated inside their own entries, and identity fields
  duplicated across files.
- **What the SPA loads and when** — the boot set, the files primed by the surface that needs them, and
  recipes read per item rather than as a 10 MB table.

**Not live SoT** until this project is complete and promotion is approved.

Named for the **work**, not a git branch. **Project close** = plan stages done + live-SoT **promote**
(go-ahead).

## Does not own

- **Whether a build runs, and what the run costs** — the version check, the relevance gate, the archive
  fetch → [../static-data-build/contents.md](../static-data-build/contents.md)
- **What the conversion computes.** Output *shapes* are in scope; the figures in them are not.
- **The shell and the hashed assets**, their cache tiers, the Go static server and release safety →
  [../spa-delivery/contents.md](../spa-delivery/contents.md)
- **Cloudflare dashboard configuration.** This project names the rule, its cost and its prerequisites,
  and measures what the zone does today; it does not hold the configuration.
- **How an owner holds a file for synchronous reading** — `staticFile`, `prime`/`read`/`view`/`reset`
  and the name-keyed maps are live SoT and are deliberately untouched →
  [frontend/static-data/staticFile.md](../../frontend/static-data/staticFile.md)
- **The blueprints API endpoint's contract**, which already exists and is already used → live
  `backend/api`.

## Task map

| I need to… | Read |
|------------|------|
| Goals, stages, done-when, open questions | [plan.md](./plan.md) |
| Know what is additive, breaking, or migrate-required | [plan.md](./plan.md) § Wire compatibility |
| Understand why the 10 MB recipe file is being taken out of the browser | [plan.md](./plan.md) § Stage E |
| See what the payloads cost to download, parse and hold | [measurements/payloads.md](./measurements/payloads.md) |
| Argue about compacting the JSON before repeating an assumption | [measurements/payloads.md](./measurements/payloads.md) § Indentation |
| See what Cloudflare does with the static data files, and why | [measurements/cloudflare.md](./measurements/cloudflare.md) |
| Know what has to land before edge caching is switched on | [measurements/cloudflare.md](./measurements/cloudflare.md) § What has to be true first |
| See the Cache Rule that is applied, and why it guards on the version parameter | [measurements/cloudflare.md](./measurements/cloudflare.md) § The zone as it now stands |
| Read how the delivery path behaves after a landed slice | [overlay.md](./overlay.md) |
