# Changestream tenant scale — review

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
This review edits nothing outside the project folder and does not move any status in `plan.md`;
it records what the code bears out so the plan can be corrected deliberately.

Verified against the working tree on 2026-10-05 (HEAD 051f79cf9 plus uncommitted changes). No file
under `services/core`, `services/capacity-controller`, `services/shared/wsplacement` or
`services/shared/mongo/connect.go` is modified or untracked in `git status --short`, so the committed
tree is the tree reviewed for this project.

## Summary

The project isolates busy tenants in the core changestream publisher: metrics first, then per-tenant
publish queues behind each collection-group Watch, with seams left for a later dedicated Watch per
whale. Its statuses are honest. Phase A-0 (the watcher's own Mongo client and a 30s `MaxAwaitTime`)
is in the code with live tests; Phase A, B and D have no code at all; Phase C is withdrawn and
`CollectionGroups()` is unchanged.

Two things most need attention. First, the folder contradicts itself about Phase C: `plan.md` says
withdrawn, while [overlay.md](./overlay.md) and
[overlays/c-collection-groups.md](./overlays/c-collection-groups.md) still say "open — blocked on
product collections", and the A-0 overlay still sizes the pool for "Phase C's corp/alliance groups".
Second, Phase B is described as a scheduling change but carries two correctness choices the plan does
not make: how the per-group resume token advances once publishes complete out of stream order, and
what the watch loop does when one tenant's bounded queue is full. Both decide whether the
at-least-once guarantee the plan relies on survives, and neither is an implementer's to pick silently.

## Verified status

| Stage / slice | Plan says | Code bears out | Evidence | Verdict |
|---------------|-----------|----------------|----------|---------|
| Phase 1 — folder, plan, scaffolds, section row | Done | All present | this folder; `../contents.md` row | confirmed |
| A-0 — idle-timeout baseline | Landed, live-tested, not promoted | A watch client with no operation timeout and a pool of `streams + watchPoolSpare`; `SetMaxAwaitTime(30s)` on every stream; the client created on gain-primary and disconnected on lose-primary; three live tests | `services/shared/mongo/connect.go` (`applyBaseOpts`, `watchClientFromURL`, `ConnectWatch`, `watchPoolSpare = 4`), `services/core/changestream/watcher.go` (`changeStreamMaxAwaitTime`), `under_primary.go` (`ConnectWatch(startCtx, uint64(len(CollectionGroups())))`), `live_idle_test.go` (`TestLive_Watch_survivesIdleAndDeliversAfter`, `TestLive_Watch_allGroupsAwaitLeavesPoolRoom`, `TestLive_Watch_idleCancelIsPrompt`) | confirmed |
| A — metrics | Not landed; "next" | No instrument anywhere in `services/core/changestream`. Core's meter carries ESI, SDE, users and app-config instruments only | `services/core/metrics/register.go` (`RegisterAll`), `metrics/common/meter.go`; `grep` for `Meter()` under `services/core` finds no changestream caller | confirmed |
| B — per-tenant publish queues | Not landed | Decode, tenant resolve, publish and resume-token save all run serially on the group's watch goroutine | `watcher.go` (`watchCollectionGroup` loop, `processChangeEvent` → `w.nats.Publish`, then `w.tokens.Save`) | confirmed |
| C — corp/alliance collection groups | Withdrawn (`plan.md`); "open (blocked on product collections)" (`overlay.md`, `overlays/c-collection-groups.md`) | Three groups — `account`, `planner`, `blueprints` — and no owner-kind group | `collection_groups.go` (`CollectionGroups`) | confirmed for `plan.md`; the two overlay files are stale |
| D — auto-detect / dedicated Watch | Open, optional, seams only | No pinned-tenant config, no Watch factory taking a pipeline and a resume key, resume keys per group only | `watcher.go` (pipeline built from `MatchPipelineForCollections(group.Collections)` only), `services/core/primaryhandoff/keys.go` (`ResumeTokenKey(groupID)`) | confirmed |
| Baseline table — resume key, publish call, downstream filter | `eip:core:handoff:v1:cs:resume:{groupID}`; sync `(*NATS).Publish`; WS filters by hosted tenants | As stated | `primaryhandoff/keys.go` (`Prefix`, `resumeTokenPrefix`), `watcher.go`, `services/websocket/server/fanout_filters.go` (`reconcileDocFanoutFilters`) | confirmed |
| "Capacity controller may consume publisher hot-tenant metrics later" | Not yet | The controller reads `HostedTenantCount` from websocket placement state and nothing from core | `services/capacity-controller/cluster/swarm.go:161`, `cluster/types.go:72`, `services/shared/nats/envelope.go:59` | confirmed |
| Swarm-stack citations | Links into `../swarm-stack/` | `overlays/12-changestream-lease.md`, `overlays/18-capacity-controller.md`, `overlays/20-selective-fanout.md` exist; `roadmap.md` has the heading `## Multi-tenant fit (account \| corp \| alliance)` the anchor targets; "decision #32" is row 32 of the roadmap's decisions table (single-primary core, multi-active rejected) | `../swarm-stack/overlays/`, `../swarm-stack/roadmap.md:226`, `:1050` | confirmed |

**Discrepancies**

- *Phase C is recorded three ways.* `plan.md` § Phase C and the status checklist say withdrawn.
  [overlay.md](./overlay.md) row C says "open (blocked on product collections)", and
  [overlays/c-collection-groups.md](./overlays/c-collection-groups.md) still describes a target
  registry. [overlays/a0-idle-timeout.md](./overlays/a0-idle-timeout.md) § Pool sizing says deriving
  the pool from the registry "means Phase C's corp/alliance groups widen the pool automatically". The
  derivation is right and useful; the reason given no longer exists.
- *A-0 overlay counts four groups.* "All four collection groups rebuilt on a ~15s cycle" — the
  registry has three today.
- *"Decision #32" reads as ticket #32.* The citation resolves, but in the same roadmap ticket #32 is
  `eip sync` / `eip secrets`. Naming it "roadmap decisions table, row 32" would stop a reader landing
  on the wrong one.
- *[metrics.md](./metrics.md) speaks of Prometheus metric names.* Core emits OpenTelemetry instruments
  through `common.Meter()` (`core.esi.publication_skipped`, `core.sde.current_build_number`, …), and
  Alloy converts them (`deployment-tool/internal/kit/obs/alloy/config.alloy`,
  `otelcol.exporter.prometheus`). The contract Phase A fills in is OTel instrument names and attribute
  keys; the Prometheus names follow from them.
- *Two other projects point here for something this project disowns.*
  [shared-planners/contents.md](../shared-planners/contents.md) and
  [realtime-message-routing/contents.md](../realtime-message-routing/contents.md) both send "websocket
  hosted tenants" to this folder's `contents.md`, whose § Does not own sends WS selective fan-out and
  placement on to live websocket.md and swarm-stack #20. The live owner is
  [backend/websocket/websocket.md](../../backend/websocket/websocket.md) § Hosted-tenant query view.

## What each remaining step changes

### Phase A-0 — idle-timeout baseline

Landed; see [overlays/a0-idle-timeout.md](./overlays/a0-idle-timeout.md). Its "Follow-up left open"
(an idle await still ends the inner loop, so the stream is closed and rebuilt with `StartAfter`) is
visible in `watcher.go`: when `changeStream.Next` returns false with no error the loop logs
"change stream closed, reconnecting..." and sleeps two seconds before a new `Watch`. Phase B inherits it.

### Phase A — metrics

**Today.** The only publisher signals are log lines. One event produces:

```text
level=INFO msg="change stream event published to NATS" component=changestream operation=update
  collection=job_documents doc_id=… subject=doc.update.corporation:corp_56_JxK.job_documents.…
  tenant=corporation:corp_56_JxK has_delta=true
```

A resume-token save failure is a warning inside `primaryhandoff.ResumeTokens.Save`, which returns
nothing to the watcher. A rebuild is "change stream closed, reconnecting..." or "change stream error,
will reconnect". Nothing is countable without a log query.

**After.** [metrics.md](./metrics.md) fixes the labels (`group_id`, `tenant`) and the signals, and
leaves the names open. An illustration in the style core already uses — the names are this review's,
not the plan's:

```go
// services/core/metrics/changestream (new), on common.Meter()
core.changestream.events_total                       {group_id, outcome=published|skipped|failed}
core.changestream.publish.duration_milliseconds      {group_id}          // JetStream ack wait
core.changestream.tenant_events_total                {group_id, tenant}  // tenant = models.Owner.Key()
core.changestream.last_advance_age_seconds           {group_id}          // observable gauge
core.changestream.resume_token_save_failures_total   {group_id}
core.changestream.stream_rebuilds_total              {group_id, reason=idle|error|invalid_resume}
```

`tenant` takes the string `processChangeEvent` already computes as `tenantString`, which is the same
`models.Owner.Key()` encoding `services/shared/wsplacement` and the `doc.update` subject use.

**Work.**

1. A `changestream` group under `services/core/metrics/`, registered from `RegisterAll`, following
   `metrics/esi` and `metrics/sde`.
2. Record at the five points in `watcher.go`: publish success, intentional skip (schema-maintenance
   write, no tenant), publish failure, stream rebuild by reason, and last successful advance.
3. Make a resume-token save failure countable — `ResumeTokens.Save` returns its error or takes a hook.
4. Tests on the recording helper with the OTel manual reader; the live publish tests assert a count
   moves.
5. Fill [metrics.md](./metrics.md) with the names and [overlays/a-metrics.md](./overlays/a-metrics.md)
   with what landed. A Grafana panel is optional per the plan.

**Wire.** Additive. New metric series only; no subject, payload or stored shape changes.

### Phase B — per-tenant publish queues

**Today.** One goroutine per group does everything in stream order:

```go
// services/core/changestream/watcher.go, watchCollectionGroup
for changeStream.Next(ctx) {
    changeStream.Decode(&changeEvent)
    procErr := w.processChangeEvent(ctx, changeEvent) // builds the message and waits for the JetStream ack
    if procErr != nil { continue }                    // token not advanced
    token, _ := resumeTokenFromEvent(changeEvent)
    w.tokens.Save(ctx, group.ID, token)               // one token per group, in stream order
}
```

A slow ack for one tenant holds every tenant in that group, and the saved token always names the last
event published, because nothing publishes out of order.

**After.** The plan's target: the watch goroutine decodes and resolves the tenant, then hands the
message to a bounded per-`tenantString` worker that publishes and waits for the ack. The plan does not
give a shape; this is an illustration of what it implies:

```go
type pendingPublish struct {
    subject string
    payload []byte
    token   bson.Raw // this event's resume token
    seq     uint64   // position in the group's stream order
}

type tenantQueues struct {
    queues map[string]chan pendingPublish // tenantString -> bounded FIFO, one worker each
    // lowest seq not yet acknowledged; the group token may be saved up to just before it
}
```

Order is preserved per tenant because each tenant has one worker. Order across tenants is no longer
preserved, which is what the plan wants, and is why the token can no longer be saved per event: saving
tenant B's later token while tenant A's earlier event is still queued would skip A's event on a
restart. See § Decisions, "How the resume token advances".

**Work.**

1. Split `processChangeEvent` into build (pure, on the watch goroutine) and publish (on a worker).
2. The per-tenant dispatcher, bounded queues, idle-worker reaping, and cancellation on lose-primary
   through the context `Start` already cancels.
3. Resume-token advancement by the chosen rule, with `live_resume_test.go` extended for a restart while
   one tenant is backed up.
4. The queue-full policy by the chosen rule.
5. Keep plain `(*NATS).Publish`; never the `Batching()` handle (plan § The publish call Phase B builds
   on has been reshaped).
6. Queue depth and age per tenant added to the Phase A instruments.
7. The A-0 follow-up: continue on the same cursor after an idle await instead of rebuilding.
8. The done-when test: a synthetic hot tenant whose publishes are delayed does not move another
   tenant's publish latency on the same group.

**Wire.** None. The `doc.update.{tenantString}.{collection}.{docID}` subject and
`ChangeStreamMessage` are unchanged. Consumers already tolerate duplicates; cross-tenant interleaving
changes, per-tenant order does not.

### Phase C — corp/alliance collection groups

Withdrawn; see [plan.md](./plan.md) § Phase C. Nothing to build. The two overlay files need their
status corrected.

### Phase D — auto-detect / dedicated Watch

**Today.** A Watch is opened in one place with a pipeline that can only name collections, and a resume
key that can only name a group:

```go
pipeline := MatchPipelineForCollections(group.Collections) // {$match: {"ns.coll": {$in: […]}}}
w.tokens.Load(ctx, group.ID)                               // eip:core:handoff:v1:cs:resume:{groupID}
```

**After.** Per [auto-detect.md](./auto-detect.md): a Watch factory that accepts a pipeline and a resume
key, so a pinned tenant's stream matches `_meta.owner.kind` / `_meta.owner.id` on `fullDocument` and
`fullDocumentBeforeChange` under a key such as `…:cs:resume:{groupID}:tenant:{tenantString}`, and the
default stream excludes that tenant. Only the seams are owed now, and only as part of Phase B.

**Work.** In Phase B: have the Watch constructor take `(pipeline, resumeKey)` rather than a group. Not
now: the pinned-tenant config, the controller, hysteresis, soak tests.

**Wire.** None for the seams. A dedicated Watch would add Redis keys, which is additive.

## Decisions needed

### How the resume token advances once publishes are out of order

**Question.** With per-tenant workers, which event's token is saved as the group's resume point?

**Why it is James's call.** The plan's done-when says "resume still advances safely (at-least-once OK)"
without a rule, and the rule is the difference between at-least-once and silent loss after a primary
handoff. It also sets how much is replayed on every failover.

**Options.**

- *Low-water mark.* Save the token of the newest event below which every event is acknowledged. Never
  skips; a stuck tenant holds the mark back, so a restart replays every other tenant's events since
  then as duplicates.
- *Save only when all queues are empty.* Simple, same safety; under steady load the token may rarely
  advance, making every restart a long replay.
- *A token per tenant.* Precise, but it multiplies Redis keys by tenant count and needs a Watch per
  tenant to resume from, which is Phase D's design, not B's.

**Recommendation.** Low-water mark, with the mark's age exported as a metric so a held-back token is
visible. Record the rule in [overlays/b-tenant-queues.md](./overlays/b-tenant-queues.md).

**Blocked until decided.** Phase B.

### What the watch loop does when a tenant's queue is full

**Question.** When one tenant's bounded queue is full, does the group's watch goroutine block, drop, or
spill?

**Why it is James's call.** Blocking brings back the stall the phase exists to remove, for exactly the
case it targets; dropping breaks delivery; spilling moves the bound to memory. The plan says "bounded
queue" and stops.

**Options.** Block the group loop (safe, back-pressure reaches Mongo's cursor, other tenants wait once
the bound is hit); drop and count (never acceptable for document changes without a client reload
signal); unbounded or disk spill (no stall, memory risk under a sustained whale); block, and treat a
sustained full queue as the Phase D promotion signal.

**Recommendation.** Block, with a generous bound and a queue-age metric, and name sustained fullness as
the signal Phase D keys on. That keeps at-least-once and makes the limit of Phase B measurable rather
than hidden.

**Blocked until decided.** Phase B.

### Whether tenant-labelled series are always on

**Question.** Is `tenant` an attribute on always-exported instruments, or sampled / top-K?

**Why it is James's call.** [metrics.md](./metrics.md) § Still open leaves it, and it sets the
Prometheus cardinality the observability add-on carries on a single host, which is an operator cost
every self-hoster inherits.

**Options.** Always on for one counter only (`tenant_events_total`), everything else by group;
always on for all signals; top-K computed in-process and exported as a small fixed set.

**Recommendation.** One always-on per-tenant counter plus, after Phase B, per-tenant queue depth for
tenants that currently have a queue (the worker set is already bounded by activity). Histograms stay
group-only.

**Blocked until decided.** Phase A's instrument list.

### Phase A alone, or A and B together

**Question.** Does Phase A ship and gather a baseline before Phase B, or do they land together?

**Why it is James's call.** The plan says A is a prerequisite "before changing scheduling";
[overlays/b-tenant-queues.md](./overlays/b-tenant-queues.md) says "or land together". They cannot both
hold.

**Options.** A first (a baseline exists to judge B against, and Phase D's "only if B is insufficient"
test has numbers); together (one touch of `watcher.go`, no baseline of the serial loop).

**Recommendation.** A first. It is small, additive, and the plan's own gate for D depends on having
measured the serial loop.

**Blocked until decided.** Nothing; it orders the next two slices.

### Who decides a promotion in Phase D

**Question.** In-process core loop, or the capacity controller consuming the metrics?

**Why it is James's call.** [auto-detect.md](./auto-detect.md) § Still open lists it. The controller
today owns Docker scale and reads websocket placement only; giving it a say over Mongo Watches crosses
the boundary the plan's non-goals draw ("does not own Mongo Watches").

**Recommendation.** Defer, as the plan does, until Phase B metrics exist. If it is ever needed, keep
the decision in core: the primary already owns every Watch and the controller would only be a second
hop for a signal core computes itself.

**Blocked until decided.** Nothing in A or B.

## Dependencies and order

- **Waits on:** nothing external. The shared-NATS publish reshape has landed (`(*NATS).Publish` in
  `watcher.go`), and the lease gate (swarm-stack #12) and selective fan-out (#20) are live.
- **Shared-planners cross-check.** [shared-planners](../shared-planners/plan.md) § What a connection
  subscribes to makes the delivery gate an owner and collection pair. Both halves are already in the
  subject this project locks — `doc.update.{ownerKey}.{collection}.{docID}` — so the open item there
  (G6, a personal planner's jobs riding the account key) is a websocket delivery change and asks
  nothing of the publisher. A fix that re-keyed personal-planner documents on the publisher side would
  break the subject shape this plan lists as a non-goal.
- **Waited on by:** shared-planners at scale. With Phase C withdrawn, Phase B is the only isolation
  between a large corporation planner and every other tenant in the `planner` group.
- **Recommended next slice:** Phase A, after the tenant-series decision; then correct the three stale
  Phase C references in the same docs pass. Phase B follows once the resume-token and queue-full rules
  are chosen.
