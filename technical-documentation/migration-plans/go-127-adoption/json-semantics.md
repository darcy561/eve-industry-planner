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
v1: {"apiJobs":null,"apiOrders":null,"parentJobs":null,"build":{"setup":null,…
v2: {"schemaVersion":0,"apiJobs":[],"apiOrders":[],"parentJobs":[],"build":{"setup":{},…
```

| # | Difference | Effect here |
|---|-----------|-------------|
| 1 | v2 `omitempty` means "omits an empty **JSON** value", so `0` / `false` / `0.0` are emitted | Largest single cost — ~100 fields, including the websocket change flags in [`changestream/watcher.go`](../../../services/core/changestream/watcher.go), ESI types, and document-lock payloads |
| 2 | Nil slices and maps marshal as `[]` / `{}`, not `null` | Client-visible on every non-`omitempty` slice field in the models |
| 3 | No HTML escaping of `<`, `>`, `&` | No in-tree consumer embeds JSON in HTML |
| 4 | Map keys not sorted | Does not affect the ETag in [`api/helper/httpcache.go`](../../../services/api/helper/httpcache.go) — it re-parses and canonicalises with sorted keys before hashing. Any shape change does churn every ETag once on deploy. |
| 5 | `time.Duration` has no default representation and is a **hard marshal error** | No `time.Duration` field carries a json tag today. Relevant before one is added: the `format:` tag that fixes it is still gated behind `ExperimentalSupportFormatTag`. |

## Differences that change acceptance

Reading input that v1 accepted: duplicate object names now error (v1 took last-wins), lone surrogates now error (v1 substituted U+FFFD), and `APIJOBS` no longer matches an `apiJobs` tag.

Generic-map paths are unaffected by the case rule — [`shared/archiveimport/normalize.go`](../../../services/shared/archiveimport/normalize.go) does its key handling explicitly over `map[string]any` rather than leaning on case-insensitive struct matching.

## Ports unchanged

Verified working under v2 with no edit: the 14 custom `MarshalJSON` / `UnmarshalJSON` methods (`FlexibleInt64` parsed `"42"` identically), the four `json:",inline"` embeddings of `MetaData`, `json.RawMessage` (now an alias for `jsontext.Value`), `json.Number`, `[]byte` base64, and `time.Time` RFC 3339.

## The retag rule (Phase A1)

`omitzero` behaves **identically under both engines**, which is what makes the retag provable before the engine question is settled:

```
zero struct   omitempty v1: {"t":"0001-01-01T00:00:00Z"}
              omitempty v2: {"i":0,"f":0,"b":false,"t":"0001-01-01T00:00:00Z"}   <- the break
              omitzero  v1: {}
              omitzero  v2: {}                                                    <- agree
```

Safe to retag: `int`, `float`, `bool`, `string`, pointer.

**Not** safe to retag — the tags genuinely differ, and these types already agree between engines under `omitempty`:

| Type | `omitempty` | `omitzero` |
|------|-------------|------------|
| Empty-but-non-nil slice / map | omits | keeps `[]` / `{}` |
| Zero `time.Time` | keeps `"0001-01-01T00:00:00Z"` | omits |

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
