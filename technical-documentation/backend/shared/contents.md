# Backend — shared

## Owns (SoT)

Shared Go libraries under `services/shared` that are not owned by a single service topic, including
the messaging layer — streams, subjects, publish and consume, and schedules — and the outbound HTTP
client and ESI rate limiter.

## Does not own

- Feature contracts exposed via HTTP → [api/](../api/contents.md)
- EVE SSO token exchange and JWT validation → `services/shared/evesso`, documented with sessions in [api/auth/sessions.md](../api/auth/sessions.md)
- Stack topology / EnsureMongo → [stack/](../../stack/contents.md), [deploy.md](../../deployment/deployment-tool/cli/deploy.md)
- Test depth for shared packages → [testing/services/shared.md](../../testing/services/shared.md)
- Recurring cron jobs and what each one does → [core/](../core/contents.md) (this section owns schedules, not the crons that use them)

## Task map

| I need to… | Read |
|------------|------|
| Use the Mongo handle / Docs / writers / Retry | [mongo.md](./mongo.md) |
| Name a new Mongo collection | [mongo.md](./mongo.md) § Collection naming |
| Work out whether a subject is stored or fire-and-forget | [nats.md](./nats.md) § Two kinds of messaging |
| Find which stream or subject carries something | [nats.md](./nats.md) §§ JetStream streams, Core-NATS topics |
| Publish a task, or add a new one | [nats.md](./nats.md) § Publishing |
| Send many messages in a loop | [nats.md](./nats.md) § Publishing |
| Know whether a publish waited, and whether it was retried | [nats.md](./nats.md) § Publishing |
| Consume a subject, and decide what happens to a message | [nats.md](./nats.md) § Consuming |
| Work out why a message was redelivered, or never came back | [nats.md](./nats.md) §§ Consuming, Two kinds of messaging |
| Add, change or retire a stream | [nats.md](./nats.md) § JetStream streams |
| Understand how abandoned durables are removed | [nats.md](./nats.md) § Durable cleanup |
| Schedule something for later, or cancel it | [nats.md](./nats.md) § Schedules |
| Work out why a schedule did not fire | [nats.md](./nats.md) § Schedules |
| Know what is retried and what is not | [nats.md](./nats.md) § Errors and retry |
| Document locks (shared package) | [api/document-lock/](../api/document-lock/overview.md) (API topic owns product behaviour; package under `services/shared/core/documentlock`) |
| Make an outbound HTTP call from a service | [esi.md](./esi.md) § Outbound HTTP |
| Stream a large response without holding it whole | [esi.md](./esi.md) § Outbound HTTP |
| Retry a request, or decide what is not retryable | [esi.md](./esi.md) § Outbound HTTP |
| Call ESI from a service | [esi.md](./esi.md) |
| Work out what a call costs, and what the allowance is | [esi.md](./esi.md) § What a bucket is |
| Tune how one endpoint is paced | [esi.md](./esi.md) § Endpoint policy |
| Understand why a call was refused and when to come back | [esi.md](./esi.md) § Acquiring a slot |
| Work out whether ESI is down, and how that was decided | [esi.md](./esi.md) § Downtime is observed, never scheduled |
| See what ESI activity is reported to Grafana | [esi.md](./esi.md) § What it reports |
| Read or reset ESI bucket state as an operator | [esi.md](./esi.md) § Operating it |
