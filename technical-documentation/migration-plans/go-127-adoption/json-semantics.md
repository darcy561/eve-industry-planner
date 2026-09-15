# v1 vs v2 JSON semantics — measured

Evidence behind [plan.md](./plan.md) Track A. Every result below was produced against the Go 1.27 toolchain and this repo's own model types, not read from release notes. Re-measure before relying on any row if the toolchain moves.

## Two different changes

| Change | State |
|--------|-------|
| **Engine** — `encoding/json` reimplemented on top of v2 | Already in effect; arrives with the 1.27 builder image. Full module suite passes unchanged. |
| **API** — call sites move to `encoding/json/v2` | Track A. This is a semantics change, not a refactor. |

Performance is **not** a reason to do the second one. On the representative planner Job document from [`job_model_parity_test.go`](../../../services/shared/models/job_model_parity_test.go) (~3.4KB, 22 top-level keys), `-benchtime=3s -count=3`:

| Operation | v1 | v2 | v2 + `DefaultOptionsV1` |
|-----------|-----|-----|------------------------|
| Unmarshal | 22.3µs | 19.3µs | 22.5µs |
| Marshal | 9.6µs | 10.0µs | 9.7µs |
| Allocations | 38 / 11 | identical | identical |

The reason to migrate is read-side strictness: duplicate object names rejected, invalid UTF-8 rejected, case-sensitive field matching, and a real `ErrUnknownName` sentinel.

## Differences that change bytes

Zero-value `models.Job` under each engine:

```
v1: {"displayOnPlanner":false,…,"parentJobs":null,…,"build":{"setup":null,"costs":{"extrasCosts":null,…
v2: {"schemaVersion":0,"displayOnPlanner":false,…,"parentJobs":[],…,"build":{"setup":{},"costs":{"extrasCosts":[],…
```

| # | Difference | Effect here |
|---|-----------|-------------|
| 1 | v2 `omitempty` means "omits an empty **JSON** value", so `0` / `false` / `0.0` are emitted | Largest single cost — ~100 fields, including the websocket change flags in [`changestream/watcher.go`](../../../services/core/changestream/watcher.go), ESI types, and document-lock payloads. `_meta` shows it too: v2 emits `version` and `archiveProcessed`, which v1 omits |
| 2 | Nil slices and maps marshal as `[]` / `{}`, not `null` | Client-visible on every non-`omitempty` slice field in the models |
| 3 | No HTML escaping of `<`, `>`, `&` | No in-tree consumer embeds JSON in HTML |
| 4 | Map keys not sorted | Does not affect the ETag in [`api/helper/httpcache.go`](../../../services/api/helper/httpcache.go) — it re-parses and canonicalises with sorted keys before hashing. Any shape change does churn every ETag once on deploy. |
| 5 | `time.Duration` has no default representation and is a **hard marshal error** | No `time.Duration` field carries a json tag today. Relevant before one is added: the `format:` tag that fixes it is still gated behind `ExperimentalSupportFormatTag`. |

## What the strictness would actually reject — measured

The read-side rules are the reason to migrate, so the question is what they would break. Measured
against this repo's own models and its recorded payloads:

| Check | Result |
|-------|--------|
| `json` tags scanned | 1,082 fields under `services/` that carry a wire name — of 1,122 json-tagged fields in all, the other 40 being 35 `json:"-"` and 5 name-less `,inline` tags that the case rule cannot reach |
| Two tags in one struct differing only by case | **0** — nothing changes meaning under exact matching |
| Tags carrying upper-case characters | 452, i.e. the surface the case rule can reach |
| Recorded payloads decoded under v2 | 212 (every `.json` in `services/`, `testing/`, `frontend/src`, plus every JSON literal embedded in their sources) |
| Duplicate object names | **0** |
| Invalid UTF-8 | **0** |
| Payload keys matching a tag only case-insensitively | **0** |

The request-body boundary was checked separately because it is the one carrying
`DisallowUnknownFields`, where a case mismatch becomes a 400 rather than a silently ignored field: 40
tags across the 26 request structs, checked against every case variant appearing in the SPA. Four
candidates surfaced and all four were false positives — JSX label text (`Setup Count:`) and an error
message, not object keys.

The detectors were validated against deliberately bad input — a duplicate name, a case-shifted key and
an invalid UTF-8 byte — and all three fired, so the zeroes above are evidence rather than a silent
harness.

**Limit of this measurement.** The corpus is recorded test data and fixtures, not live traffic, and it
does not include live ESI responses. ESI is the only producer here we do not control, so it is the one
place a case-only difference could still be hiding; everything inside the stack is written by code in
this repository.

## Differences that change acceptance

Reading input that v1 accepted: duplicate object names now error (v1 took last-wins), lone surrogates now error (v1 substituted U+FFFD), and `JOBSTATUS` no longer matches a `jobStatus` tag.

The case rule reaches struct field matching only, and no path decodes JSON into a generic map today,
so nothing in the tree relies on the old behaviour.

## Ports unchanged

Verified working under v2 with no edit: the six custom `MarshalJSON` / `UnmarshalJSON` methods (`ExtraCost` still read a numeric `category` as a string), the four `json:",inline"` embeddings of `MetaData`, `json.RawMessage` (now an alias for `jsontext.Value`), `json.Number`, `[]byte` base64, and `time.Time` RFC 3339.

## The retag rule (Phase A1)

`omitzero` behaves **identically under both engines**, which is what makes the retag provable before the engine question is settled:

```
zero struct   omitempty v1: {"t":"0001-01-01T00:00:00Z"}
              omitempty v2: {"i":0,"f":0,"b":false,"t":"0001-01-01T00:00:00Z"}   <- the break
              omitzero  v1: {}
              omitzero  v2: {}                                                    <- agree
```

Safe to retag: `int`, `float`, `bool`, `string`, pointer.

Two `bson` tags had already made this mistake and have been corrected. `JobMetaData.ArchivedAt` and
`.DeletedAt` carried `bson:"…,omitzero"`, which the driver does not parse, so every job document was
written with a year-1 date instead of an omitted field:

```
bson omitzero  -> {"archivedAt":{"$date":{"$numberLong":"-62135596800000"}}}
bson omitempty -> {}
```

[`backfill_archived_at.go`](../../../services/core/commands/backfill_archived_at.go) already filtered
for that zero time, so nothing read a wrong answer, but the stored dates were meaningless. The `bson`
halves are now `,omitempty`, the `json` halves keep `omitzero`, and `TestNoBSONTagClaimsOmitzero` in
[`shared/mongo/bson_tag_options_test.go`](../../../services/shared/mongo/bson_tag_options_test.go)
fails if the pattern returns. It sweeps the module source rather than reflecting over a list of
models, because the invariant is that no `bson` tag anywhere says this — a list only covers the models
someone remembered to add, which is how this one survived.

`omitzero` is a **JSON** tag option. The BSON driver (v2.8.0) does not read it — its tag parser knows
`omitempty` only. A field's two tags are usually written as one pair, so a retag must change the
`json` half alone and leave `bson:"…,omitempty"` where it is. Changing the BSON half instead silently
drops the option, and on a job document that changes what the upsert writes.

**Not** safe to retag — the tags genuinely differ, and these types already agree between engines under `omitempty`:

| Type | `omitempty` | `omitzero` |
|------|-------------|------------|
| Empty-but-non-nil slice / map | omits | keeps `[]` / `{}` |
| Zero `time.Time` | keeps `"0001-01-01T00:00:00Z"` | omits |

A struct field is the one case where `omitempty` diverges by **engine** rather than by tag. Because v2
reads "empty" off the marshalled output, a struct whose every field is itself omitted marshals to `{}`
and is then dropped; v1 never omits a struct. Measured:

```
type AllOmitzero struct { A int `json:"a,omitzero"`; B string `json:"b,omitzero"` }
type NeverEmpty  struct { A int `json:"a"` }
Outer{}  omitempty v2: {"solid":{"a":0},"t":"0001-01-01T00:00:00Z"}   <- "empty" dropped
```

So a struct field's `,omitempty` is inert only while the struct carries at least one always-emitted
field. `models.UserAccountDocument` (7 of 9) and `models.ApplicationSettings` (15 of 22) both do, which
is why dropping their tags is safe today — but the safety is a property of those types, and it moves if
their fields are ever all made omitting.

## The house options (Phase A2)

This set produces **byte-identical** output to v1 on `Job`, `UserAccountDocument`, `ArchivedJobStats` and on a mixed map, while keeping v2's read-side strictness:

```go
jsonv2.JoinOptions(
    jsonv2.FormatNilSliceAsNull(true),
    jsonv2.FormatNilMapAsNull(true),
    jsontext.EscapeForHTML(true),
    jsonv2.Deterministic(true),
)
```

`FormatNilSliceAsNull` is the knob Phase A4 turns off per boundary, if and when that shape change is decided.

`jsonv2.Marshal(v, json.DefaultOptionsV1())` is also byte-identical to v1, but it discards the strictness and is slower than v1 on unmarshal. It is a shim for a call site that cannot be reasoned about yet, not a destination.
