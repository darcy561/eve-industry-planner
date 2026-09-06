# ESI collections — behaviour overlay

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).

While this project is active, this file is the overlay on top of live SoT: where it describes a
surface, it wins for that in-flight work. Where it is silent, live documentation remains the truth.

Each stage fills its section as it lands — what changed, and how that part works afterwards. Empty
sections mean the stage has not landed.

## Current behaviour (before this project)

### Assets

Asset rows arrive from ESI as a flat list and are cached per character hash (`characterAssets`) and
per corporation member (`corporationAssets`). Nothing derives a shared structure from them. Each of
the seven consumers listed in [plan.md](./plan.md) § Who reads assets today builds its own maps with
its own traversal, resolves location and container names itself, and writes the results into the
`worldData` store from inside its own effect.

A row's location and its hangar or asset-safety compartment are not stored; both are recovered by
walking parents at the point of use, by three separate implementations that disagree at the edges.

A corporation's assets are fetched once per tracked member because ESI returns only what each
character's roles permit, then merged and deduplicated by `item_id`. That fan-out is correct and
this project keeps it.

### Blueprints

Blueprint rows are fetched per character for both the character and the corporation endpoint, and
stamped at the fetch boundary with `CharacterHash`, `is_corporation`, and `character_id` or
`corporation_id`. Because the corporation query is keyed by character hash, a corporation with
several tracked directors fetches its whole list once per director and the aggregate concatenates
them without deduplication.

The aggregate hook and its cache-reading counterpart return different shapes for the same value, and
the eight consumers are split across both. Product type and job type are not stored on a row; each
consumer joins against the cached search index at the point of use.

### Login and call path

Login prefetches through two entry points: the session-apply step triggers the main character, and
the account sync then triggers every linked character. For each character, eight character queries
and six corporation queries are fired together, with characters processed three at a time. Every
prefetched query is forced enabled, overriding the logged-in and server-status gate the query
definitions carry.

Corporation collections are fetched once per character rather than once per corporation, so an
account with several characters in one corporation fetches that corporation's data several times.
Assets are prefetched by neither path and are fetched when a consumer mounts.

### Documentation

There is no live topic doc for either surface. `frontend/` currently owns auth, document lock and
lifecycle roadmaps only — see [`../../frontend/contents.md`](../../frontend/contents.md).

## Stage A — the shapes and their builders

_Not landed._

## Stage B — the query surface

_Not landed._

## Stage C — the collection table and the login call path

_Not landed._

## Stage D — location names as one shared query

_Not landed._

## Stage E — consumer cutover

_Not landed._

## Stage F — the renderers

_Not landed._

## Stage G — page reshape

_Not landed; in-scope decision open._

## Draft for `frontend/esi-collections/spa.md`

The live topic this project promotes into does not exist yet, so its draft is assembled here as the
stages land. Live topic shape applies — short intro, the anchors, the wiring, topic-only detail, no
migration language — so that promotion is a move rather than a rewrite.

### Intro and anchors

_Not written._

### The row shapes and what they resolve

_Not written._

### Corporation access models

_Not written._

### The index hooks and their scopes

_Not written._

### The login collection table

_Not written._

### Assembling a view

_Not written._

## Draft for `testing/frontend/`

The frontend testing entry is a placeholder today. This project's coverage is summarised here as it
lands, in the depth labels that module uses, and promotes with the rest.

_Not written._
