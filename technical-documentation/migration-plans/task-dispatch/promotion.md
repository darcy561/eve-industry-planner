# Task dispatch — promotion

What this project owes live documentation, drafted so promoting is folding rather than writing.

Process: [`../documentation-rules.md`](../documentation-rules.md) § Promote checklist.

Links inside the drafted sections are written relative to their **destination**, not to this file, so
they resolve once folded in.

## Where it goes

| Destination | Change |
|-------------|--------|
| [`backend/core/core.md`](../../backend/core/core.md) | § Triggering a task **added** — no live page describes the operator task surface |
| [`backend/core/contents.md`](../../backend/core/contents.md) | Owns widened, one task-map row |

**Stages A, B and D are already live.** The worker-runtime project promoted them, because the same
code carried them: [backend/worker/worker.md](../../backend/worker/worker.md) § Running a task holds
the subject-resolves-to-a-task rule and the refusal, and
[backend/shared/nats.md](../../backend/shared/nats.md) holds the envelope shape. Nothing below repeats
them.

Only Stage C is outstanding, and only because core's commands have never had a live topic.

---

## For `backend/core/core.md` — new section

## Triggering a task

An operator runs a worker task by name through `eip cli` → [verbs.md](../../deployment/deployment-tool/cli/verbs.md):

```bash
eip cli tasks list
eip cli tasks checkSdeUpdates
eip cli tasks applySdeVersion --version=3272045
```

`tasks list` prints what is runnable, with each command's worker task name, subject and default queue.

**A task is runnable because it is listed, not because it exists.** `dispatchTable` in
[`core/commands/tasks.go`](../../../services/core/commands/tasks.go) is the allowlist: one entry per
command, holding what an operator types, the task definition it names, and the call that publishes
it. The registry may hold a task that has no entry, and that task is not reachable from the command
line.

**Each entry publishes through the task's own helper**, not through a subject and a payload assembled
here. A command therefore cannot queue a request in a shape the handler does not take, and the flags
a task needs are its entry's business — `applySdeVersion` refuses without `--version` before anything
is published.

Adding a task to the operator surface is one entry. A command name that differs from the worker task
name is part of that entry rather than a second mapping to keep in step.

---

## For `backend/core/contents.md`

**Owns** gains: *…and which worker tasks an operator can trigger by name.*

Task map gains:

| I need to… | Read |
|------------|------|
| Trigger a worker task by name, or make one triggerable | [core.md](./core.md) § Triggering a task |

---

## Not promoted

The `--data` flag is gone rather than documented. It could only reach the four trigger tasks, whose
handlers take no request and discarded it, so it was accepted, validated as JSON, published and
ignored. No live page described it, so nothing has to be corrected — only not written.
