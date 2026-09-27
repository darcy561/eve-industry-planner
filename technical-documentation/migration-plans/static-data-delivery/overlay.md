# Static data delivery — behaviour overlay

How the delivery path works **after** each slice lands. Live docs remain the truth wherever this file is
silent; where it speaks, it wins for this project's in-flight work.

Sections are written as their stage lands, not in advance — an overlay describing work that has not
happened is a plan, and the plan is [plan.md](./plan.md).

## The published bytes

*Stage A — not started.*

## The manifest and what a version is

*Stage B — not started.*

## The serve path

*Stage C — not started.*

## The edge

*Stage D — partial.*

A static-data file requested at its versioned URL is now served from Cloudflare's cache. A Cache Rule
marks the path eligible when the request carries the version parameter, so each build's URL is its own
cache entry and origin sees roughly one fetch per build per upper tier rather than one per reader per
PoP.

The bare, un-versioned path still reaches origin on every request, and that is the point: the API serves
it `immutable` while its content changes every build, so the rule requires the version parameter and
leaves the bare path uncached. That requirement is what allowed this to land before the files are
content-addressed.

`/meta` also reaches origin every time, but nothing in the rule excludes it — it simply never carries a
query string, so the expression does not match how the SPA asks for it. Asked for with one it is cached
like anything else, for the ten minutes its own `Cache-Control` allows.

Rule text, the settings that changed with it and the probes →
[measurements/cloudflare.md](./measurements/cloudflare.md) § The zone as it now stands.

## What the SPA loads, and when

*Stage E — not started.*
