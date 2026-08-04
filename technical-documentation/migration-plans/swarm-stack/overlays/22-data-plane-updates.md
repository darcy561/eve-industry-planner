# #22 — Data-plane container updates (mongo / redis / nats)

**Roadmap:** [../roadmap.md](../roadmap.md) `#22`  
**Status (mirror):** **done** — absorbed into **`eip update`** / [#23](./23-app-image-ship.md). No separate verb or playbook.

**History.** Live behaviour → [verbs.md](../../../deployment/deployment-tool/cli/verbs.md) (`eip update`).

## What changed

Ticket assumed a separate intentional data-plane bump path. Reality: kit stack YAML (incl. `docker-stack.data.yml`) syncs on **`eip update`**, then `images.LiveImageRefs` pulls app + data (+ obs when on) and digest-reconcile force-updates drifted services. Data services already use Swarm `stop-first` / named volumes in the data fragment.

## How this part works after the change

Bump a data image pin in the kit fragment → ship → operator **`eip update`**. Same path as app/obs image refresh. No second verb.

## Still open

_None._

## Missing live SoT discovered mid-work

_None — live `verbs.md` Day-2 section corrected on close._

## Notes / decisions

- Absorbed into #23 / `eip update`; do not invent a parallel data-only ship verb.
- Hard Mongo major bumps may still need Ensure / operator care after the roll — that is dataplane Ensure territory, not a #22 playbook.
