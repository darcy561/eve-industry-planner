# Archived jobs statistics — behaviour overlay

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).

While this project is active, this file is the overlay on top of live SoT: where it describes a
surface, it wins for that in-flight work. Where it is silent, live documentation remains the truth.

Each stage fills its section as it lands — what changed, and how that part works afterwards. Empty
sections mean the stage has not landed.

## Current behaviour (before this project)

Archived jobs are aggregated into one flat document per account and item type, mirroring the shape
the planner used before the Mongo move. There is no time dimension, no snapshot history, and no
corporation-level view. The statistics API exposes a single build-stats read.

Live detail: [backend/contents.md](../../backend/contents.md).

## Stage A — data model and Mongo layer

_Not landed._

Fill in: persisted document shapes, collections and indexes introduced, dirty-queue semantics, and
what happens to existing build-stats documents.

## Stage B — account statistics pipeline

_Not landed._

Fill in: how an account's archived jobs become rollup buckets and snapshots, what marks an account
dirty, recomputation triggers, and task ownership.

## Stage C — corporation statistics pipeline

_Not landed._

Fill in: how member jobs roll into corporation figures, which identity a job is attributed to,
pruning rules, and how this differs from account aggregation.

## Stage D — statistics API

_Not landed._

Fill in: endpoints, request and response shapes, and which contracts are additive versus replacing
an existing read.

## Stage E — frontend

_Not landed._

Fill in: which views consume which endpoints, and what a user sees that they did not before.

## Missing live SoT found during this work

Drafts for documentation that should exist but does not, written here first and promoted when the
project closes.

_None recorded yet._
