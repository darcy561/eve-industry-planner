# JSON encoding (`services/shared/jsoncodec`)

Live SoT for how this codebase reads and writes JSON — one shared policy behind `Marshal`,
`Unmarshal`, `Encode`, `Decode`, `UnmarshalRequest`, `MarshalIndent` and `StreamArray`. Package:
[`services/shared/jsoncodec`](../../../services/shared/jsoncodec).

HTTP request/response wiring built on it → [api/json.md](../api/json.md). ESI's streamed responses →
[esi.md](./esi.md) § Outbound HTTP. Mongo's `bson` half of a tagged field → [mongo.md](./mongo.md).

Strictness runs both ways: a read rejects a duplicate member name, invalid UTF-8 and a field name
that matches a tag only by case; a write refuses a string holding invalid UTF-8 rather than repairing
it.

## Defaults

| Piece | Default | Change |
|-------|---------|--------|
| HTML escaping | on | `services/shared/jsoncodec/jsoncodec.go` `options` |
| Map key order | deterministic | same |
| Nil slice | `[]`, never `null` | same — `FormatNilSliceAsNull` left off |
| Nil map | `{}`, never `null` | same — `FormatNilMapAsNull` left off |
| Trailing newline on `Encode` | always written | same |

`null` is left for what is genuinely absent — a nil pointer, which no option here reaches. A reader
calling `Object.values` on a `null` throws and on `{}` does not, which is the reason an absent map is
never sent as `null`.

## Functions

| Function | Use |
|----------|-----|
| `Marshal` / `Unmarshal` | in-memory bytes |
| `Encode(w, v)` / `Decode(r, v)` | stream to or from an `io.Writer` / `io.Reader` |
| `MarshalIndent` | indented output for a payload read outside this codebase — the SDE static-data table a browser downloads |
| `UnmarshalRequest` | the strict decode for a body another party sent us — see § Strict vs lenient |
| `StreamArray[T]` | reads a JSON array one element at a time so a body too large to hold whole never has to be — the ESI market-order and price feeds |

`Encode` writes the trailing newline itself, because the two engines disagree on it: leaving it out
would drop a byte from every response written through this package.

## Strict vs lenient

| Producer | Function | Why |
|----------|----------|-----|
| An HTTP request body — the SPA, or another service calling synchronously | `UnmarshalRequest` | We hold the schema. An undeclared member means a client sent something not agreed to, and refusing it is the point; a 400 is something a caller can act on |
| A websocket frame from the SPA | `Unmarshal` (lenient) | Same schema, but a refused frame is a message that quietly never arrives rather than an actionable error — the SPA must be able to add a field without the server rejecting every frame |
| ESI, EVE SSO, the Docker daemon | `Decode` (lenient) | Their schema, not ours. Each adds fields without asking, and refusing an undeclared member would turn an ordinary upstream release into a failed call |

`UnmarshalRequest` refuses an undeclared member and answers `ErrTrailingData` — not a syntax error —
for a body carrying more than the one value asked for. Case matching is exact and silent either way:
a field named only by different case does not match and does not error, which is why the request path
relies on the unknown-member refusal rather than on a mismatch surfacing on its own.

## Write-side strictness

A Go string holding invalid UTF-8 stops the write. The v1 engine repaired the bad bytes into U+FFFD
and wrote the document anyway; this refuses instead, because writing U+FFFD into a stored document is
silent corruption. A caller publishing a changed document through this package meets that refusal as a
dropped publish rather than a delivered one — see [core.md](../core/core.md) § Changestream → JetStream.

## The `json` / `bson` tag pair

A numeric or bool field whose zero means "not set yet" carries `,omitzero` on its `json` tag, not
`,omitempty` — `omitempty` only omits an empty JSON value (`null`, `""`, `{}`, `[]`) and does nothing
for a number or a bool, so a field meaning "not set" would otherwise write a `0` or a `false` that
asserts something untrue about the record. Eight fields stay on `,omitempty`, and the guard below carries the reason for each. Seven are
`SchemaVersion`, whose zero a release step normalises away. The eighth is `_meta.revision`, and it is
the one worth reading twice: absence and zero mean different things there, because the release step
seeds exactly what `{_meta.revision: {$exists: false}}` matches. A missing counter is a document that
step has not reached; a zero one is a bug. Omitting it would let one imitate the other.

**The `bson` half never follows.** The mongo driver's tag parser knows `,omitempty` only, and does not
read `,omitzero` — a `bson` tag carrying it silently drops the option and writes the zero value to
every document. A field's two tags are usually written as one pair; retagging only the `json` half and
leaving `bson:"…,omitempty"` in place is the rule, not an oversight.

`go fix` will not perform the `json`-half retag itself. It sees the rewrite, logs that it is declining
a fix with a behaviour change, and leaves it for a reviewed change instead.

Both halves of this are guarded rather than merely documented, using
[`testing/gosource`](../../testing/harness.md) to walk every file in the module rather than reflecting
over a list of types — the types most likely to carry either mistake are unexported ones a test does
not otherwise reach:

| Guard | Package | What it fails on |
|-------|---------|-------------------|
| `TestScalarFieldsDoNotClaimOmitempty` | `shared/jsoncodec` | A numeric or bool field tagged `json:",omitempty"` that is not in its exemption list, each entry naming the reason its zero cannot reach a document |
| `TestNoBSONTagClaimsOmitzero` | `shared/mongo` | A `bson` tag anywhere in the module carrying `,omitzero` |

## What still imports `encoding/json` directly

Every call in `services/` that marshals, unmarshals, or opens an encoder or decoder goes through this
package, with two exceptions:

| Why | Files |
|-----|-------|
| Operator-facing output, read by a person rather than decoded by anything in this codebase | `core/commands/cli`, `capacity-controller/ctl`, `cmd/mongo_parity_sample` |
| A `json.Number` nothing can reach. Three are a `case json.Number` arm in a type switch over `any`, which only a decoder configured with `UseNumber` could produce and none is. The fourth decodes *into* one as a third fallback after `string` and `float64`, which between them answer every JSON value, so it is never reached either | `websocket/server/outgoinglogic/decode.go`, `worker/tasks/sde/update/recipeListDiffStage.go`, `conversion/sde_typeid.go`, and `shared/models/job.go` respectively |

## Topic-only detail

- `StreamArray` reads one JSON array of one element type; it is not a general streaming decoder. It
  opens on `[`, decodes each element through the house options, and closes on `]`.
- Raw JSON held as bytes is a `jsontext.Value`, in the nineteen files that hold any. It behaves as
  `json.RawMessage` did on every axis a caller depends on — decoded bytes, encoded bytes, `omitempty`
  on an absent value, and the absent/`null`/value distinction that tells "not sent" from "sent as
  null" from "sent with a value". The one remaining `json.RawMessage` is in `cmd/mongo_parity_sample`,
  which is operator output.
- `RejectUnknownMembers` is set nowhere but `UnmarshalRequest`; every other decode in the tree is
  lenient by construction, including the ones inside this package.
