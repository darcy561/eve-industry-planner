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
**silent**: `{"JOBID":…}` does not match `jobID` and does not error either, so the one
`DisallowUnknownFields` site needs `RejectUnknownMembers` to keep refusing. And the test that lists the
fields still carrying `,omitempty` is swept from the type graph rather than sampled — sampling hid nine
of the twelve, because a field on a nested row is only reached if a fixture populates the slice holding
it.

### A3 — Call-site routing

**Write side landed; read side open.** Every HTTP response in `services/` now encodes through
[`jsoncodec`](../../../services/shared/jsoncodec/). The only `json.NewEncoder` calls left are the two
in `capacity-controller/ctl`, which write operator output to stdout and are outside the project.

It needed no new abstraction, because the layer was already there and under-used.
[`helper.EncodeJSON`](../../../services/api/helper/json.go) had 36 callers — 35 qualified plus one
inside the package — and wanted one line changed; none of them were touched. What it lacked was a
status code, which is why 18 sites hand-rolled `Content-Type` + `WriteHeader` + `Encode` around it,
eight of them in `documentlocks/handlers.go` alone. `EncodeJSONStatus` closes that: 16 of the 18 now
go through the pair, and the other two call `jsoncodec` directly.

`EncodeJSONStatus` sets the content type **before** the status. `WriteHeader` sends the header map as
it stands, so delegating to `EncodeJSON` after writing the status would lose the type silently — the
response still carries a body and still looks right in a browser. The test asserts the header on the
*sent* response rather than on the recorder, which is the difference that catches it.

`EncodeJSON` deliberately still writes no status: 15 of its callers choose their own — twelve 200s, a
201, a 409, and one computed at runtime.

`websocket/server` and `shared/plannersession/request` call `jsoncodec` directly. They cannot reach
`api/helper` — one service never imports another's packages — and neither needs the status variant.

`api/helper/compression.go` is gone. It held one JSON function under a name describing what nginx
does; it now sits in `json.go` with the request side.

**Still open on this phase:** the read side. `DecodeJSONRequest` keeps `DisallowUnknownFields`, which
needs `RejectUnknownMembers` to go on refusing, and `buildJSONRequestError` still matches
`*json.SyntaxError` / `*json.UnmarshalTypeError` and string-prefixes `"json: unknown field "`. That is
the one file `go fix` still reports, held deliberately. It has **no tests** — none of the JSON helpers
did before this slice, and the encode side got the first five — so coverage goes on before the error
types are rewritten, not after.

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
