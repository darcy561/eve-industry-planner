# Go 1.27 adoption — plan

**Status:** Phase 1 (docs) — complete; no track work started
**Code in scope:** [`services/`](../../../services/) (all areas), [`testing/`](../../../testing/), [`deployment-tool/`](../../../deployment-tool/)
**Live SoT (until promote):** [backend/core/core.md](../../backend/core/core.md), [backend/api/contents.md](../../backend/api/contents.md), [technical-rules.md](../../technical-rules.md) § Prefer modern Go

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

## Prerequisite (landed before this project)

The language-version move is done and is **not** a track here:

| Piece | Now |
|-------|-----|
| `services/go.mod`, `deployment-tool/tools/go.mod` | `go 1.27.0` (`deployment-tool/go.mod` was already there) |
| Six `services/*/Dockerfile` + `deployment-tool/Dockerfile` (both stages) | `golang:1.27.0-alpine` |
| Toolchain directives | None added, in any module |
| Verification | `go build`, `go vet`, `go test` clean on both modules |

Two consequences that the tracks below depend on:

- **`encoding/json` is now the v2-backed implementation.** The `jsonv2` GOEXPERIMENT ships on by default in the 1.27 toolchain, so moving the builder images changed the engine under every existing `encoding/json` call. v1 *semantics* are preserved by the legacy-options path; the full module test suite passes unchanged. The only opt-out is build-time `GOEXPERIMENT=nojsonv2` — there is no runtime GODEBUG for it.
- **`encoding/json/v2` is now reachable.** `go vet` rejects the v2 API below language version 1.27 (`json.Marshal requires go1.27 or later`), so Track A was blocked until the bump and is not blocked now.

## Goals

1. Decide and execute a position on **`encoding/json/v2`** — gaining its read-side strictness without silently changing any wire contract.
2. Put the **time-driven wait loops** that currently cost wall clock (or have no coverage at all) on simulated time.
3. Clear the **`go fix` backlog** the new language version exposed, scoped per area rather than as one sweep.

## Non-goals (this project)

- Adopting v2's default semantics wholesale as a single change.
- Changing the JSON shape of any client-facing response as a side effect of an engine or API change; shape changes are a deliberate, separately-decided step (Track A, Phase A4).
- Migrating `MarshalIndent` operator output (`eip cli` JSON) to v2 — human-read output gains nothing from either the strictness or the speed.
- Rewriting tests that need real infrastructure (miniredis, live Mongo) to run under simulated time without a seam; the seam is a named prerequisite, not an assumed one.

## Track A — `encoding/json/v2`

Measured behaviour differences, the retag rule, and the house-options set: [json-semantics.md](./json-semantics.md). Read that before starting any phase here.

Surface: 148 files import `encoding/json` (41 shared, 28 worker, 27 websocket, 23 core, 21 api); 173 `Unmarshal` and 99 `Marshal` call sites; 242 `,omitempty` tags of which ~100 sit on numeric or bool fields; 14 custom marshaler methods; one production `DisallowUnknownFields` site. There is **no** shared JSON helper today — every call site imports the stdlib directly.

```mermaid
flowchart LR
  A1["A1 retag scalars<br/>omitempty to omitzero"]
  A2["A2 shared/jsonwire<br/>house options"]
  A3["A3 route call sites<br/>per area"]
  A4["A4 per-boundary<br/>shape decisions"]
  A1 --> A2 --> A3 --> A4
  A1 -. "verified byte-identical under v1" .-> A1
```

### Phase A1 — Retag scalars, still on v1

`,omitempty` → `,omitzero` on **scalar** fields only (int / float / bool / string / pointer). `omitzero` behaves identically under both engines, so this is provable while still on the v1 API and removes the single largest source of v2 shape drift.

**Do not** retag slices, maps, or `time.Time` — the two tags genuinely differ there, and those types already agree between engines under `omitempty`.

Done when: every scalar `omitempty` in `shared/models` and the cross-process payload structs is retagged, and a byte-equality assertion over the representative documents passes unchanged.

### Phase A2 — `shared/jsonwire`

One shared package owning the house options (`FormatNilSliceAsNull`, `FormatNilMapAsNull`, `EscapeForHTML`, `Deterministic`) plus thin `Marshal` / `Unmarshal` / encode / decode wrappers. This is the one-SoT home the codebase lacks; the options must not be re-declared per call site.

Done when: the package exists with tests proving byte-identical output to v1 for the representative documents, and its options are the only place the policy is written down.

### Phase A3 — Route call sites, area by area

`shared` → `core` → `worker` → `websocket` → `api`, finishing each area's cutover within its own slice. No forwarding wrappers left behind.

Includes rewriting [`api/helper/json.go`](../../../services/api/helper/json.go) error handling: it currently matches `*json.SyntaxError` / `*json.UnmarshalTypeError` and string-prefixes `"json: unknown field "`. v2 replaces these with `*jsontext.SyntacticError`, `*json.SemanticError`, the `json.ErrUnknownName` sentinel, and a `jsontext.Pointer` field path — strictly better, and it deletes the stringly check.

Done when: no product file outside `shared/jsonwire` imports `encoding/json` directly, except the `MarshalIndent` operator-output sites named under non-goals.

### Phase A4 — Per-boundary shape decisions

Only after A3. Take boundaries one at a time, internal first (Redis blobs, asynq / NATS payloads — both ends are ours), then websocket, then the client-facing API. Each is a deliberate wire decision, not a default.

**Wire compatibility:** A1–A3 are **additive/neutral** by construction. A4 is **breaking** per boundary for any consumer distinguishing `null` from `[]`, and the read-side strictness is **breaking** for any producer sending duplicate keys or mismatched field case. No such in-tree producer was found; `eip cli` output and Firestore import data are external enough to need a check before A4 touches them. Mixed-version rolling deploys are low risk in the other direction — extra zero-valued fields are ignored by v1 readers.

## Track B — Simulated-time tests

Feasible with no seam, all in-process and channel-driven:

| Target | Today |
|--------|-------|
| [`core/servicemanager/managed_test.go`](../../../services/core/servicemanager/managed_test.go) | Three deadline + `time.Sleep(10ms)` poll loops |
| [`core/scheduler/cancel_on_shutdown_test.go`](../../../services/core/scheduler/cancel_on_shutdown_test.go) | 3s / 5s / 5s deadlines around gocron shutdown |
| [`core/scheduler/esi/downtime.go`](../../../services/core/scheduler/esi/downtime.go) | **No test files in the package at all** — the deferral waits until 11:15 UTC, so it has never been coverable |

The downtime work carries a defect to fix with it: the deferring goroutine blocks on `<-timer.C` with no context branch, so it cannot be cancelled on shutdown. That is a live gap against [technical-rules.md](../../technical-rules.md) § Concurrency and cancellation, and it is exactly what a simulated-time test pins down.

Blocked until a seam exists — these drive real leases through miniredis, which serves over loopback TCP and exposes no custom-listener API. Real network I/O never counts as durably blocked, so a bubble deadlocks rather than fails:

- [`core/primarycontroller/controller_test.go`](../../../services/core/primarycontroller/controller_test.go) (5.05s of the suite's wall clock)
- [`core/leadership/failover_test.go`](../../../services/core/leadership/failover_test.go)
- [`core/singleton/service_test.go`](../../../services/core/singleton/service_test.go)

The seam now has a home: every Redis-backed test takes [`testing/redisfake`](../../../testing/redisfake/), which owns construction of the miniredis server and its client. Making those tests bubble-safe means giving that one constructor an in-memory transport (or a fake lease behind [`shared/core/redis/lease`](../../../services/shared/core/redis/lease/)) rather than editing each test. Sized and decided before any of those three are attempted.

Done when: the three unblocked targets run under `testing/synctest`, the downtime cancellation gap is fixed with the test that proves it, and the lease-seam decision is recorded here either as scheduled or as declined.

## Track C — `go fix` sweep

`go fix -diff ./...` at the new language version reports **57 files**: `errors.As` → `errors.AsType`, `interface{}` → `any`, `wg.Go`, `slices` / `maps` adoption, `for range n`, `max()`, plus gofmt alignment.

By area — `services/` 47: shared 19, core 9, api 9, worker 4, ws-router 2, websocket 2, capacity-controller 2. Separate module `testing/` 10.

Land **per area, scoped to that area**, per [technical-rules.md](../../technical-rules.md) § Prefer modern Go — not as one 54-file commit, and not widened into packages a slice does not otherwise touch. Where an area is already being opened by Track A Phase A3, its `go fix` slice should land first so the JSON change reviews clean.

Done when: `go fix -diff` is empty for every area, or a remaining suggestion is recorded here with the reason it was waived.

## Open decisions

| # | Decision | Needed by |
|---|----------|-----------|
| 1 | Is v2's read-side strictness (duplicate names, case sensitivity, UTF-8 validation) worth the migration at all, given the measured ~13% unmarshal gain and no marshal gain? | Before A1 |
| 2 | Does the frontend contract keep `null` for empty collections, or move to `[]`? Governs whether `FormatNilSliceAsNull` stays on permanently. | A4 |
| 3 | Is the lease seam in `shared/core/redis/lease` worth building for test determinism alone? | Track B |

## Done-when (project)

All three tracks closed or explicitly declined, the Track A wire decisions recorded per boundary in [overlay.md](./overlay.md), and go-ahead given to promote the landed behaviour into live SoT.
