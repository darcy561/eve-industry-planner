# What CCP's changes feed says about our builds

Walked 2026-09-24: 80 consecutive builds from the then-latest `3539543` (2026-09-23) back to
`3277600` (2026-02-27), chained through `_meta.lastBuildNumber` in
`https://developers.eveonline.com/static-data/tranquility/changes/<build>.jsonl`.

The feed names which datasets moved in a build and how. The latest file is 850 bytes; the largest in
this window is 5.8 KB. It carries a `_meta` record with `buildNumber`, `lastBuildNumber` and
`releaseDate`, then one record per changed dataset with any of `added`, `changed`, `removed`,
`changedLocalization` (all id arrays) and `schemaChanged` (a boolean).

79 distinct dataset keys appeared across the window. The conversion reads eight of them, and every one
appears under its bare basename — `types`, `typeDogma`, `mapSolarSystems` and so on — so a map from
dataset key to filename is a plain table rather than a trimmed extension.

## The eight datasets the conversion reads

| Dataset | Builds touched (of 80) | added | changed | removed | changedLocalization | schemaChanged |
|---|---|---|---|---|---|---|
| `types` | 64 (80%) | 36 | 32 | — | 45 | **4** |
| `typeDogma` | 33 (41%) | 17 | 29 | 1 | — | — |
| `dogmaAttributes` | 19 (24%) | 11 | 9 | — | 5 | — |
| `groups` | 14 (18%) | 7 | — | — | 9 | — |
| `marketGroups` | 14 (18%) | 8 | 1 | — | 6 | — |
| `blueprints` | 9 (11%) | 5 | 7 | — | — | — |
| `typeMaterials` | 9 (11%) | 9 | 2 | — | — | — |
| `mapSolarSystems` | 9 (11%) | 1 | 7 | — | 2 | — |

`types` is the only busy one. Five of the eight move in under a fifth of builds. `mapSolarSystems`,
the only input to `solarSystems.json`, moved nine times in seven months.

`schemaChanged` fired on `types` in builds 3407448, 3409592, 3464040 and 3466501, and on datasets we
do not read a further three times.

## What a build costs today

| | Builds | What the pipeline does |
|---|---|---|
| Touch **none** of the eight | 12 (15%) | 99 MB download, full conversion, full republish |
| Touch ours by `changedLocalization` **only** | 13 (16%) | the same |
| Structural change to at least one of ours | 55 (69%) | the same |

The localisation-only rows matter because the map build keeps one locale and discards the rest, so a
change in another locale cannot reach published output. The feed records ids, not locales, so it
cannot decide these on its own — that is what a content comparison after conversion is for.

## Which output each dataset feeds

Derived from the call order in `conversionStage.go`, counting structural changes only:

| Output | Built from | Builds affected | Published size (dev sample) |
|---|---|---|---|
| `inventionModifiers.json` | types, dogmaAttributes, typeDogma | 53/80 (66%) | **2 KB** |
| `recipeList.json` | blueprints, types | 49/80 (61%) | 10.13 MB |
| `fullItemList.json` | blueprints, types, groups | 49/80 (61%) | 1.67 MB |
| `searchIndex.json` | derived from `recipeList` | 49/80 (61%) | 494 KB |
| `reprocessingData.json` | typeMaterials, types, blueprints, marketGroups | 49/80 (61%) | 98 KB |
| `marketGroups.json` | marketGroups, and `fullItemList` | 49/80 (61%) | not in sample |
| `solarSystems.json` | mapSolarSystems | **7/80 (9%)** | not in sample |

**24 of the 80 builds (30%) structurally touch only `typeDogma` and/or `dogmaAttributes`** — and the
only output those feed is the 2 KB `inventionModifiers.json`. Each of those builds currently reissues
all seven files under a new version label, so every client discards and re-downloads the whole table to
collect a 2 KB change.

## A weaker gate, recorded so it is not mistaken for a good one

The feed gives changed ids, so one could also ask whether any changed type is one we publish. Over the
53 builds with matchable `types` ids: 8,838 ids changed, 6,375 (72%) appear in a published item list,
and 15 of 53 builds changed only ids that do not.

Do not build on this. `added` ids cannot be matched by definition — a new type may be exactly the one
that belongs in the output — and the 19,537-id list used for the intersection is the worker's local
dev sample, not live. A content comparison after conversion gets the same benefit without the guess.

## Sizes quoted here

Published sizes are measured from the worker's local `tmp/sde/live_data`, which is a **dev**
conversion. Live `/api/static-data/meta` on the same day reported `recipeList.json` at 9,908,977 bytes
and `fullItemList.json` at 1,692,794 — within a few percent, so the dev sample is representative of
scale but is not the live figure. Live production was also serving only five of the seven file keys.
