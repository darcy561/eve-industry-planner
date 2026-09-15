# Go 1.27 adoption — overlay

What changed and how each part works **after** the change. Live docs remain the truth wherever this file has no entry. Fill a section as its slice lands; do not pre-write behaviour that has not shipped.

Promote target on go-ahead: [backend/core/core.md](../../backend/core/core.md), [backend/api/contents.md](../../backend/api/contents.md), and [technical-rules.md](../../technical-rules.md) § Prefer modern Go.

## Track A — `encoding/json/v2`

### A1 — Scalar retag

_Not started._ Record here: which packages were retagged, and the byte-equality evidence.

### A2 — `shared/jsonwire`

_Not started._ Record here: the package's exported surface, the house options it owns, and the rule for when a call site may pass its own options.

### A3 — Call-site routing

_Not started._ Record here, per area: cutover state, and the new shape of JSON request-error handling in the API.

### A4 — Boundary shape decisions

_Not started._ One row per boundary once decided — Redis blobs, asynq / NATS payloads, websocket messages, client-facing API — stating the shape that boundary now emits and why.

## Track B — Simulated-time tests

_Not started._ Record here: which tests moved to `testing/synctest`, and the outcome of the Redis seam decision.

## Track C — `go fix` sweep

**`shared` (partial) and `capacity-controller` (clear).** Four packages rewritten by `go fix` scoped to
each: `strings.Cut` in [`core/objectstore/s3.go`](../../../services/shared/core/objectstore/s3.go),
`maps.Copy` in [`telemetry/natsprop`](../../../services/shared/telemetry/natsprop/natsprop.go) and
[`cluster/clusterfake`](../../../services/capacity-controller/cluster/clusterfake/fake.go), and
`slices.Backward` in [`policy/evaluate.go`](../../../services/capacity-controller/policy/evaluate.go).
`go build`, `go vet`, `go test` and `go fix -diff` are clean on that scope.

**Waived, with reason:** [`shared/core/sde/files.go`](../../../services/shared/core/sde/files.go) keeps
its `,omitempty` on `generated_at` for now. The fixer wants it gone and dropping it is provably inert —
a zero `time.Time` is emitted under `omitempty` by both engines — but it is a JSON wire tag, and Track A
takes the tag questions together rather than one file at a time. `shared` is not clear until that is
settled.

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
`go build`, `go vet`, `go test` and `gofmt` are clean; `go fix -diff ./api/...` now reports only the
three deferred files.

**`deployment-tool/` (clear).** Two files:
[`internal/config/flow_apply_test.go`](../../../deployment-tool/internal/config/flow_apply_test.go) and
[`service_patch_test.go`](../../../deployment-tool/internal/config/service_patch_test.go) now set moby's
`swarm.Service.Version` directly instead of wrapping it in `Meta: swarm.Meta{…}`. This is a Go 1.27
language change rather than a dependency one — `Service` still embeds `Meta`, but a promoted field is now
allowed in a struct literal. `go build`, `go vet`, `go test`, `gofmt` and `go fix -diff` are clean across
the module.
