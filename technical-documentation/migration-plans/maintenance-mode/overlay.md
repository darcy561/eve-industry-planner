# Maintenance mode — behaviour overlay

How each part works **after** the stage that changes it. Sections fill in as stages land; a section
marked *not landed* describes nothing yet, and live documentation remains the truth for that surface
([`../documentation-rules.md`](../documentation-rules.md) § Overlay SoT while a project is active).

Plan, stages and status → [plan.md](./plan.md).

## Stage A — Where maintenance state lives

*Not landed.*

Will describe: the Redis key and what writes it, the seed rule, the NATS topic pair and the
current-state ask, the in-process cache, and what a consumer sees when Redis is unreachable.

## Stage B — The API gate

*Not landed.*

Will describe: which paths answer during maintenance and which return 503, and where the app-config
`maintenance_mode` value now comes from.

## Stage C — Connected clients

*Not landed.*

Will describe: what a client receives when an upgrade is refused, what an open session receives when
maintenance starts, and why the container stays healthy and immediately usable rather than drained.

## Stage D — The router gate

*Not landed.*

Will describe: what `/ws` returns during maintenance, what the probe port keeps answering, and how
the router learns the state without a Redis client.

## Stage E — What core does during a window

*Not landed.*

Will describe: which scheduled work stops, which core work keeps running, what happens to tasks
already queued, and how publishing resumes.

## Stage F — Turning maintenance on and off

*Not landed.*

Will describe: the command, what it reports, and the relationship between the `MAINTENANCE_MODE`
seed and the live value.

## Stage G — What the user sees

*Not landed.*

Will describe: when the banner appears and clears, how a parked tab recovers without a reload, and
how the realtime layer behaves while parked.

## Missing live SoT found during this project

*None recorded yet.* Drafts for documentation that should exist but does not go here, in live topic
shape, and are promoted with the rest.
