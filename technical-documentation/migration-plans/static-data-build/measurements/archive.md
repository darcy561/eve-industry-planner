# How much of CCP's archive the conversion reads

Probed 2026-09-24 against build `3539543`:
`https://developers.eveonline.com/static-data/tranquility/eve-online-static-data-3539543-jsonl.zip`

## The archive

| | |
|---|---|
| Content-Length | **99,188,348 bytes** (99.2 MB) |
| Entries | **102** |
| Compressed bytes in the eight entries the conversion reads | **26.9 MB (27.1%)** |
| Central directory | 9,250 bytes, at offset 99,179,076 — read from a 2 MB tail fetch |

Largest entries by compressed size (`*` = read by the conversion):

| Entry | Compressed | Decompressed | Read? |
|---|---|---|---|
| `mapMoons.jsonl` | 37.6 MB | 224.0 MB | |
| `types.jsonl` | 23.5 MB | 153.3 MB | `*` |
| `missions.jsonl` | 14.9 MB | 53.4 MB | |
| `mapPlanets.jsonl` | 10.6 MB | 50.9 MB | |
| `mapAsteroidBelts.jsonl` | 3.7 MB | 21.8 MB | |
| `typeDogma.jsonl` | 1.3 MB | 27.7 MB | `*` |
| `mapSolarSystems.jsonl` | 1.1 MB | 5.1 MB | `*` |
| `npcCharacters.jsonl` | 1.0 MB | 6.5 MB | |

`mapMoons.jsonl` alone is 38% of the download and is never opened. The remaining five read entries
(`blueprints`, `groups`, `typeMaterials`, `marketGroups`, `dogmaAttributes`) are small enough not to
reach this table.

## What the endpoint supports

Confirmed by response headers and one conditional request:

| | |
|---|---|
| `accept-ranges` | `bytes` |
| `etag` | `"a1a3c5460d1af82dc7ee0718400179b3-12"` |
| `cache-control` | `max-age=86400` |
| Conditional GET | **verified**: `If-None-Match` against `changes/3539543.jsonl` returned `304` |
| Served by | AmazonS3 behind CloudFront |

CCP's documentation states that all resources fully support ETag and Last-Modified and that resources
only update when they actually change.

So two things are available that the pipeline does not use: ranged reads, which make the 27% figure
actionable, and conditional requests, which make a re-run of the same build cost one request.

## Latency, for sizing

`latest.jsonl` is 80 bytes with `cache-control: max-age=300`. The changes file for a build is under
6 KB with `max-age=86400`. Neither is a meaningful cost next to the archive; the gate in
[changes-feed.md](./changes-feed.md) is effectively free.

## Why this matters against the current shape

The download stage reads the whole body with `io.ReadAll` and keeps it live, because `zip.Reader`
needs random access. The comments in `downloadStage.go` and `mapBuildStage.go` reason carefully about
holding one decompressed file at a time on top of that, which is correct for the current shape and
becomes moot once the body is never materialised. `SDE_IN_MEMORY_MAX_BYTES` guards that same
`io.ReadAll`; it is read with a bare `os.Getenv`, appears in no env SoT, and therefore cannot be set
by any operator path today.
