# Task dispatch — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
For Go surfaces in scope only: `go fix -diff` before planned work; again on edited packages (not unrelated code).
Live SoT will not be edited until this project is complete and promotion is approved.

## Why this exists

The NATS rebuild made publishing a task typed: a helper per task, the payload checked by the
compiler, the queue and deadline taken from one definition. It stopped at the point the message
leaves. Everything after that is still resolved by string, and the rebuild left three things it
deliberately did not fix because each is a decision rather than a cleanup.

## The subject and the envelope disagree

A task's type is carried twice. The worker derives it from the **subject's last segment**, and the
envelope repeats it in `TaskMessage.TaskType`. Nothing compares them. A message whose subject and
envelope disagree is routed by the subject and reported by neither.

**To decide:** which one is authoritative, and whether the other is removed or checked.

## An unknown task runs on defaults

`GetPriorityQueue` and `GetTaskTimeout` fall back to `Priority3` and sixty seconds when the registry
has no definition for a name. A task that never reached the registry therefore runs — on the wrong
queue, with the wrong deadline, and without saying so. The failure is invisible precisely when it
matters, which is when someone has added a task and wired it incompletely.

**To decide:** whether an unknown task is refused rather than defaulted, and what the worker does with
the message when it is.

## The envelope wraps an envelope

`Message{Data: TaskMessage{Data: payload}}` means the worker unmarshals the same bytes twice for every
task. The inner envelope once carried a priority and a timeout override; both are gone, so it now
holds only the duplicated task type described above. If that goes, the inner envelope goes with it.

**This is the one breaking change in the set.** Collapsing it changes the wire, so it needs a stream
drain: `worker-task-stream` has a 24h `MaxAge`, which makes it feasible as a deliberate cut rather
than a rolling deploy.

## The operator CLI names tasks by string

`core/commands/tasks.go` switches on `Name` in five places to trigger any task an operator names with
a payload they supply. That is untypeable by construction — the payload is only known at runtime — so
it holds definitions rather than helpers. Its migration commands also read `Subject` and
`DefaultPriority` from definitions to print what they queued.

**To decide:** whether the CLI gets a purpose-built view (name → publish function) so it stops
reaching into definitions, and whether a publish helper should return what it published so a command
reports from the result rather than re-deriving it.

## Phases

Phase 1 is this folder.

### Stage A — One authority for a task's type

Decide between subject and envelope, and make the other either derived or checked. This gates Stage B,
because collapsing the envelope presumes the subject is authoritative.

### Stage B — Collapse the double envelope

Remove the inner envelope so a task message is one envelope and a payload. Breaking: needs a drain of
`worker-task-stream`, and the worker must be able to read what is already on the stream until it is
empty.

### Stage C — The operator CLI

Give the CLI a dispatch view of its own, and decide whether publish helpers report what they
published.

### Stage D — Unknown tasks are refused

Stop defaulting a task the registry does not know.

## Wire compatibility

Stages A, C and D are process-local. **Stage B is breaking** and is the reason this project exists as
its own effort rather than a tidy inside the NATS rebuild.

## Stage status

| Stage | Status |
|-------|--------|
| Phase 1 — project folder and docs | Done |
| A — one authority for a task's type | Not started |
| B — collapse the double envelope | Not started |
| C — the operator CLI | Not started |
| D — unknown tasks are refused | Not started |

## Handoff

**Start here:** Stage A, because Stage B depends on its answer. Stages C and D are independent of both
and can be taken in any order.
