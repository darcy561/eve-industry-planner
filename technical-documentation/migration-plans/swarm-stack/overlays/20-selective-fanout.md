# #20 — Selective JetStream / WS fan-out (interest-based)

**Roadmap:** [../roadmap.md](../roadmap.md) `#20`  
**Status (mirror):** open  
**Not live SoT.** On overlap with live docs, this overlay wins until promote.

## What changed

_Fill as work for this ticket lands. Keep current-behaviour notes here during the project._

## How this part works after the change

_Operator / implementer behaviour after the change. Promote into live SoT only with go-ahead._

## Still open

_Explicit remainders for this ticket (or “none”)._

## Missing live SoT discovered mid-work

_Draft here in live-doc shape. Promote with the rest._

## Notes / decisions

- **Locked with #8:** local hosted-tenant set is the in-process query view (`HostedTenants` / `HostsTenant`). **Rejected:** Redis interest registry mirroring `account:` / `corporation:` / `alliance:` hosting keys.
- **Cross-replica “who hosts what”:** NATS census and/or internal HTTP API (#18 consumers) — not Redis. Slot filter updates read the **local** query view only.
- Detail / acceptance: [roadmap.md](../roadmap.md) `#20`.
