# Maintenance mode

A stack-wide state an operator turns on and off at runtime. While it is on the API refuses traffic,
live WebSocket sessions are closed and new ones refused, the core scheduler stops publishing cron
work, and the SPA shows a banner. Nothing is redeployed to enter or leave it.

## Where the state lives

Redis holds the flag at `appconfig:maintenance_mode`, written as `1` or `0`. It has no TTL: the
window lasts as long as the operator leaves it on, and an expiring key would end maintenance on its
own.

**No key means off.** Nothing seeds the flag — it exists once an operator sets it, so a fresh stack
is not in maintenance, and a flushed Redis reads as out of maintenance rather than holding a window
open with nothing behind it. There is no environment variable; the CLI is the only control.

`shared/appconfig.Truthy` is the one reader of a boolean-ish value, shared by the stored flag and the
feature-flag gauge, so a hand-edited key still behaves.

### Two consumer shapes

Which one a service holds depends on whether it has a Redis client.

| Type | For | Reads |
|------|-----|-------|
| `appconfig.MaintenanceFlag` | `api`, `core`, `websocket` — services with Redis | Redis, cached per read |
| `appconfig.MaintenanceWatcher` | `ws-router` — NATS but no Redis | The broadcast, plus an ask at start and on reconnect |

`MaintenanceFlag` is constructed with a Redis client (`NewMaintenanceFlag`); `Enabled` reads and
`Set` writes. `MaintenanceWatcher` is constructed with a NATS handle (`NewMaintenanceWatcher`) and
started with `Start`, which subscribes and asks; `Enabled` reports what it was last told. Both read
as off until told otherwise.

### A read failure holds the last known value

`Enabled` never returns an error. On a Redis failure it logs once at warn and returns the last value
this process read, so an outage cannot flap the stack out of maintenance at the moment it is least
able to handle traffic. A process that has read nothing yet has nothing to hold and answers off.

`redis.Nil` is not a failure — no key is an authoritative off. The watcher behaves the same way: an
ask that goes unanswered leaves whatever it already holds.

## How a change propagates

A write is announced on core NATS, and any service can ask for the current value.

`ServeMaintenanceState` runs in core and answers the ask, so a service carrying only NATS can learn
the state without a Redis client. `MaintenanceWatcher.Start` subscribes to the broadcast and asks
once at startup, bounded to two seconds so a slow or absent responder cannot stall boot.

A NATS reconnect re-asks rather than trusting what the watcher holds, because a broadcast sent
during the disconnect was missed. That ask runs on its own goroutine: reconnect callbacks run on the
connection's serialized dispatcher, and a blocking request there would stall every other callback on
the handle.

## What each service does

### API

Middleware refuses requests with 503 and `error: "maintenance_mode"` while the flag is on. Two
things stay reachable: the probe endpoints, so orchestration does not restart healthy containers,
and `app-config`, which is how a parked tab learns the window ended.

The composition root builds one `MaintenanceFlag` and passes the same object to both the middleware
and `apideps.FromClients`, so the gate and the app-config handler answer from one cached value
rather than each reading Redis.

`app-config` reports the live flag, and its ETag follows the flag — otherwise a client holding the
previous ETag would be told the config had not changed for the whole window.

### WebSocket

New upgrades are refused. Sessions already open are told before they are closed: the service
publishes a `maintenance` message to every local client, then closes them, so a tab learns why it
lost its socket rather than inferring it from an opaque close.

The close shares its implementation with drain, differing only in write timeout — one second for
maintenance against drain's hundred milliseconds. The container is not drained: maintenance is a
state the service returns from, not a shutdown.

### ws-router

The router refuses `/ws` with 503. It carries a `MaintenanceWatcher` rather than a flag because it
has no Redis client, started before the HTTP server is built.

The gate sits **after** the upgrade counter increments, so a refused attempt still counts as an
attempt and the refusal is visible as `Placement.RefusedMaintenance`. Probes are a separate listener
and are never gated. A router with no watcher wired refuses nothing.

### Core

The scheduler checks the flag before publishing each cron job and skips with an info-level log
rather than silently doing nothing. Work already queued drains normally — maintenance stops new
publishing, it does not cancel what is in flight. Jobs stay registered and scheduled, so the window
ending needs no restart.

Core also runs the responder that answers the current-state ask, and exposes the flag as a gauge
alongside the other feature flags.

## Turning it on and off

```
eip cli tasks maintenance -on
eip cli tasks maintenance -off
eip cli tasks maintenance
```

With no flag it reports the current state and writes nothing. `-on` and `-off` write the flag, then
announce the change.

**A write that lands but fails to announce is not an error.** The flag is the source of truth and
every service re-asks on reconnect, so the announce is an optimisation for speed, not the mechanism.
The command reports the announce failure and exits zero.

## What the SPA does

The `maintenance` message is the signal. The SPA applies it directly to the shared app-config — no
fetch — so every tab flips at the same instant without a burst of identical GETs against the one
endpoint that has to stay up.

That one state change shows the banner and parks the websocket client. Parked is not disconnected:
`scheduleReconnect` returns without arming a timer, so the client stops retrying but does not tear
itself down. Backoff resets to zero on resume.

A tab with no socket — logged out, or loaded during the window — sees the banner because `app-config`
reports the flag on load.

While the banner is shown it re-reads `app-config` every 20 seconds; the socket is gone, so this is
the only way that tab learns the window ended. The poll lives in the banner rather than in
`useAppConfig`, so it exists exactly as long as the banner does and **nothing polls outside a
window**. `refreshAppConfig` sends `Cache-Control: no-cache`, so the interval governs rather than the
response cache.

The banner renders on the app-shell design, outside the page layout: the app's header and footer are
not shown during a window, because the app behind them is unreachable.
