# Go 1.27 adoption — overlay

What changed and how each part works **after** the change. Live docs remain the truth wherever this file has no entry. Fill a section as its slice lands; do not pre-write behaviour that has not shipped.

Promote target on go-ahead: [backend/core/core.md](../../backend/core/core.md), [backend/api/contents.md](../../backend/api/contents.md), and [technical-rules.md](../../technical-rules.md) § Prefer modern Go.

## Track A — `encoding/json/v2`

### A1 — Scalar retag

**Landed.** Every numeric and bool field in `services/` whose zero `,omitempty` never omitted now
carries `,omitzero` on its `json` half — 89 of the 97 the AST sweep found, across `shared/models`,
`shared/nats`, `shared/core/documentlock`, `shared/core/esi/types`, `core/changestream`,
`core/metrics/esi`, `api/v1endpoints` and the SDE conversion types. The `bson` half never follows,
because the driver does not parse `omitzero`.

The rule is about what the document says: **a field whose zero means "not set yet" is omitted**,
because writing `0` or `false` asserts something untrue about the record. Whether a reader currently
tells the two apart decided the order of the work, not its extent — and every one of these fields
already carried `,omitempty`, so the author had already asked for the zero to go and the tag had
simply never done it for a number or a bool.

Eight fields are deliberately kept on `,omitempty`: the seven `SchemaVersion` fields and
`MetaData.Revision`, whose zero is normalised away before release and seeded by the write path
respectively. Keeping them also means a regression in either would still be visible rather than
silently omitted.

The SPA idiom that made some of this urgent rather than tidy: an id read as `?? null` and then tested
`!== null` to mean "has one". Nullish coalescing does not catch `0`, so a written zero passed a guard
meant to reject it. That is the character, corporation and order ids.

A populated `Job` carrying market orders, transactions and linked ESI runs encodes byte-identically
through [`jsoncodec`](../../../services/shared/jsoncodec/) and through v1, as do a user document with a
token row, `ProductionTotalsRow` and `ArchivedJobStats`.

**How it stays true:**
[`omitempty_sweep_test.go`](../../../services/shared/jsoncodec/omitempty_sweep_test.go) parses every
`.go` file in the module and fails on any numeric or bool field tagged `,omitempty` that is not in its
exemption map, each entry carrying the reason its zero cannot reach a document. It also fails when an
exemption no longer matches anything, so the list cannot rot. It reads the source rather than
reflecting over a list of roots because the types most likely to carry the mistake are unexported ones
in packages a test does not import — the same reasoning as the BSON guard beside it, and the reason
the earlier reflective version missed `shared/models/planner` three running.

**The one wire-visible part** is the SDE static data table, the largest payload the system produces.
Its readers were traced rather than sampled: the market tree walks stop on `parent_id` by truthiness,
`has_types` reads through `Boolean()`, `category_id` and `market_group_id` are already typed optional
in the SPA's JSDoc, and five of the twenty fields have no reader at all. `metaGroupID` feeds a `??`
chain that resolves to a `Set.has()` false for both `0` and `null`; `maxProductionLimit` feeds a
division already yielding `Infinity` at `0`, so that zero does not occur. The table is rebuilt
wholesale on release rather than migrated, so no reader ever sees a mixed shape.

### A2 — `shared/jsoncodec`

**Landed, with no call sites yet.** `Marshal`, `Unmarshal`, `Encode(w, v)` and `Decode(r, v)` over one
unexported declaration of the house options, so nothing outside the package can redeclare the policy or
drift from it. A caller passes no options; A4 is what adds a way to vary one per boundary.

`Encode` writes the trailing newline itself. v1's `json.NewEncoder(w).Encode(v)` appends one and
`jsonv2.MarshalWrite` does not, so without it all 21 encoder call sites would have quietly dropped a
byte from every response — in a package whose whole purpose is that a call site can move without
changing what a reader sees.

Two behaviours are pinned by tests because they are easy to assume wrongly. Case sensitivity is
**silent**: `{"JOBID":…}` does not match `jobID` and does not error either, which is why the request
path refuses an undeclared member rather than relying on the mismatch surfacing on its own. And the
test that lists the fields still carrying `,omitempty` reads the source rather than sampling fixtures
— a sample only reaches a field on a nested row when something populates the slice holding it, which
hid most of them.

### A3 — Call-site routing

**The HTTP request and response paths are routed; the other call sites are not.** Every HTTP response in `services/` now encodes through
[`jsoncodec`](../../../services/shared/jsoncodec/). The only `json.NewEncoder` calls left are the two
in `capacity-controller/ctl`, which write operator output to stdout and are outside the project.

It needed no new abstraction, because the layer was already there and under-used.
[`helper.EncodeJSON`](../../../services/api/helper/json.go) already had its callers and wanted one
line changed; none of them were touched. What it lacked was a status code, which is why 19 sites
hand-rolled `Content-Type` + `WriteHeader` + `Encode` around it — eight in `documentlocks/handlers.go`
alone, and one in `api/helper` itself, beside the helper that should have owned it.
`EncodeJSONStatus` closes that: 17 of the 19 go through the pair, and the other two call `jsoncodec`
directly because they are outside `api` and cannot reach it.

Counts of callers are left out on purpose. They moved twice while this section was being written —
once from a slice of this project, once from endpoints landing on the branch beside it — and a figure
that rots between the writing and the reading is worse than none. `grep -rn 'helper.EncodeJSON' services/`
answers it.

`EncodeJSONStatus` sets the content type **before** the status. `WriteHeader` sends the header map as
it stands, so delegating to `EncodeJSON` after writing the status would lose the type silently — the
response still carries a body and still looks right in a browser. The test asserts the header on the
*sent* response rather than on the recorder, which is the difference that catches it.

`EncodeJSON` deliberately still writes no status: many of its callers choose their own, including a
201 and one decided at runtime, so writing a 200 on their behalf would take that away.

`websocket/server` and `shared/plannersession/request` call `jsoncodec` directly. They cannot reach
`api/helper` — one service never imports another's packages — and neither needs the status variant.

`api/helper/compression.go` is gone. It held one JSON function under a name describing what nginx
does; it now sits in `json.go` with the request side.

The ESI metrics bucket keeps writing `reported_remaining` at zero. It is CCP's own count, so zero is a
reading and not an absence — an operator looking at a rate-limit dump must not see the same thing for
"nothing left" as for "no header seen".

**Read side landed too.** `DecodeJSONRequest` reads through
[`jsoncodec.UnmarshalRequest`](../../../services/shared/jsoncodec/jsoncodec.go), which is the strict
half of the package: it refuses a member the target does not declare, and returns `ErrTrailingData`
rather than a syntax error for a body carrying more than the one value asked for. Those are the two
things a body from another party can get wrong that a lenient read would accept as meaning something
else.

The order mattered. Ten tests went on **first**, pinning what v1 refused and how — `empty_body`,
`body_too_large`, `extra_data`, `syntax_error` with its offset, `type_mismatch` with its field,
`unknown_field` with its name, `read_error`, the default-limit rule and the preview's bounds. None of
it had ever been tested. All ten passed unchanged against v2 afterwards, which is what says the
rewrite kept the contract rather than merely compiling.

Those `Detail`, `Field`, `Offset` and `BodyPreview` values are not internal: `DecodeJSONOrBadRequest`
copies them into the 400 body, so each is a shape the SPA already sees.

**The field name is now read, not parsed.** v1 named an unknown field only inside its error message,
which is why this string-prefixed `"json: unknown field "` — a check that broke on any rewording and
said nothing about a nested field. v2 carries a `jsontext.Pointer`, so `rows.0.count` comes out of the
error rather than out of its prose. The path is walked with the pointer's own `Tokens()`, which
unescapes a field name containing `/` or `~`.

**What the strictness changes.** A duplicate member, a miscased field and invalid UTF-8 were all
accepted by v1 — last-wins, matched case-insensitively, and U+FFFD respectively. Each turned a body
into a document nobody sent. All three now refuse. Checked against the SPA before landing: of the
keys it sends in hand-written request payloads, none matches a Go tag only case-insensitively, and
the documents it round-trips carry the tags the same structs produced. `filing.go` was the one
handler decoding raw, so it had no body limit, no strictness and no trailing-data check; it goes
through the helper now, and its `json.RawMessage` fields keep telling an omitted field from an
explicit null exactly as before.

`BuildJSONPayloadAndWeakETag` encodes through `jsoncodec` as well. It builds a response payload and
hashes it, so a byte moving there would miss every cached app-config a browser holds — a test pins
the payload against v1's bytes.

With this, `go fix -diff` is clean across `services/`: the one file it had been reporting was this
one, and the lines it wanted patched were replaced instead.

**Still open on Track A:** A3's remaining direct `json.Unmarshal` call sites — the Redis blobs, NATS
envelopes, asynq payloads and websocket frames — and the `json.RawMessage` values that want
`jsontext.Value`. The `core/scheduler` ones are one decision rather than ten: `contract.TaskHandler`
declares `data json.RawMessage`, and nine handlers conform to it, so the type moves and they follow. Then A4.

### A4 — Boundary shape decisions

_Not started._ One row per boundary once decided — Redis blobs, asynq / NATS payloads, websocket messages, client-facing API — stating the shape that boundary now emits and why.

## Track B — Simulated-time tests

**The seam.** [`redisfake.NewForBubble`](../../../testing/redisfake/redisfake.go) gives a test a fake
Redis it can drive from inside a bubble, over `net.Pipe` rather than a socket. It is called outside the
bubble and used inside. `Advance` moves the bubble's clock and the fake's own clock together in steps:
they are two clocks, and sleeping the whole span first would let a renewal loop run many times against
a store where no time had passed, so a lease under test would never expire.

Warming the pool is part of the seam, not an optimisation. go-redis keeps a **package-level
`sync.Pool` of timers** that its connection semaphore reaches for only when a caller has to wait for a
connection. A timer taken inside one bubble returns to that shared pool and is reused by the next
test's bubble, aborting the run with *"select on synctest channel from outside bubble"*. Each test
passed alone and the pair failed together until the pool was warmed to `bubbleConns`, which keeps every
acquire on the fast path where no timer is taken. This is why pinning `PoolSize: 1`, which the plan
first measured as the answer, does not survive a second bubble in the same process.

Connections are warmed one at a time. go-redis races on its own connection setup when several
goroutines initialise connections together, which `-race` catches with no product code involved.

Polling inside a bubble goes through [`wait.ForTicking`](../../../testing/wait/wait.go), added for
this: `wait.For` works in a bubble, because its sleep runs on the bubble's clock, but it has no way to
move a fake's own clock between checks. `ForTicking` takes that tick, and `Advance` has its shape.

**Converted.** [`servicemanager`](../../../services/core/servicemanager/managed_test.go) and
[`scheduler`](../../../services/core/scheduler/cancel_on_shutdown_test.go) needed no seam;
[`primarycontroller`](../../../services/core/primarycontroller/controller_test.go),
[`leadership`](../../../services/core/leadership/failover_test.go) and
[`singleton`](../../../services/core/singleton/service_test.go) take the bubble fixture.

Measured on `./core/...`, before → after: `primarycontroller` 5.017s → 0.010s, `leadership` 0.331s →
0.012s, `singleton` 0.408s → 0.020s. The two that keep their seconds are the ones this project's
non-goals exclude: `primaryhandoff` 5.1s is a real dial timeout against a stopped miniredis, and
`changestream` 5.0s is a literal sleep in a live-Mongo test.

## Track C — `go fix` sweep

**`shared` and `capacity-controller` (clear).** Four packages rewritten by `go fix` scoped to
each: `strings.Cut` in [`core/objectstore/s3.go`](../../../services/shared/core/objectstore/s3.go),
`maps.Copy` in [`telemetry/natsprop`](../../../services/shared/telemetry/natsprop/natsprop.go) and
[`cluster/clusterfake`](../../../services/capacity-controller/cluster/clusterfake/fake.go), and
`slices.Backward` in [`policy/evaluate.go`](../../../services/capacity-controller/policy/evaluate.go).
`go build`, `go vet`, `go test` and `go fix -diff` are clean on that scope.

**The wire tags Track A held back have landed.** `go fix` wanted `,omitempty` removed from
`generated_at` in [`shared/core/sde/files.go`](../../../services/shared/core/sde/files.go), `mod_time`
in [`api/staticdata/endpoints.go`](../../../services/api/staticdata/endpoints.go), and the
`user_document` and `application_settings` struct fields in
[`api/v1endpoints/session_types.go`](../../../services/api/v1endpoints/session_types.go). Each is inert
under both engines — a non-pointer `time.Time` and a non-pointer struct are never an empty JSON value,
so all four were always written and still are. They were held as tag questions for Track A to take
together, and A1 took them. `shared` is clear.

**`core` (clear).** Five files: `map[string]interface{}` → `map[string]any` across the four
[`commands/cli`](../../../services/core/commands/cli/) operator-output files, and `slices.Contains` in
[`live_rewrite_owner_scoped_ids_test.go`](../../../services/core/commands/live_rewrite_owner_scoped_ids_test.go).
That rewrite left `containsOwner` forwarding a single line to the stdlib, so the helper was deleted and
both call sites now call `slices.Contains` directly. The four CLI maps are `eip cli` operator output,
which this project's non-goals exclude from Track A — they need no revisiting when the engine moves.
`go build`, `go vet`, `go test` and `go fix -diff` are clean on that scope.

**`testing/` (clear).** One file: the hand-rolled clamp in
[`capacity_soak/lib/websocket.go`](../../../testing/capacity_soak/lib/websocket.go) became
`max(cfg.Clients, 1)`. `go build`, `go vet`, `go test` and `go fix -diff` are clean on that module.

**`api` (partial).** Four files: `errors.AsType` in
[`helper/endpointHelpers.go`](../../../services/api/helper/endpointHelpers.go), and trailing field
assignments folded into their struct literals in
[`authenticate.go`](../../../services/api/v1endpoints/authenticate.go),
[`refresh.go`](../../../services/api/v1endpoints/refresh.go) and
[`statistics/live_scope_test.go`](../../../services/api/v1endpoints/statistics/live_scope_test.go).

`authenticate.go` needed a hand correction: its `SessionBootstrapResponse` literal already set
`RefreshToken`, and a redundant assignment restated it afterwards, so the fixer folded in a **duplicate
field and the package stopped compiling**. The redundant assignment was deleted and the comment about
per-tab sessions moved onto the surviving field.

The fixer also leaves a stray blank line where no comment separates the folded fields, and closes the
literal on the last field's line; `refresh.go` and the statistics test were reformatted by hand.
`go build`, `go vet`, `go test` and `gofmt` are clean; `go fix -diff ./api/...` now reports only
[`api/helper/json.go`](../../../services/api/helper/json.go), which A3 takes.

**`deployment-tool/` (clear).** Two files:
[`internal/config/flow_apply_test.go`](../../../deployment-tool/internal/config/flow_apply_test.go) and
[`service_patch_test.go`](../../../deployment-tool/internal/config/service_patch_test.go) now set moby's
`swarm.Service.Version` directly instead of wrapping it in `Meta: swarm.Meta{…}`. This is a Go 1.27
language change rather than a dependency one — `Service` still embeds `Meta`, but a promoted field is now
allowed in a struct literal. `go build`, `go vet`, `go test`, `gofmt` and `go fix -diff` are clean across
the module.
