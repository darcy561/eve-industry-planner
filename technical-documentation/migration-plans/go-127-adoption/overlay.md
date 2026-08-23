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

_Not started._ Record here: which tests moved to `testing/synctest`, the fix to the uncancellable downtime deferral goroutine, and the outcome of the lease-seam decision.

## Track C — `go fix` sweep

_Not started._ Record here: areas cleared, and any suggestion waived with its reason.
