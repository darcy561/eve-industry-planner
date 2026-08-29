# Reprocessing shipping cost — behaviour overlay

Lay this on top of live frontend and backend documentation while this project is active. On
overlap, this file wins for the reprocessing calculator; where it is silent, live docs remain
the truth.

Nothing has landed yet. Each section below is filled in as its stage completes, describing
**what changed** and **how that part works now** — not what is intended.

## Stage A — Ore volume on static data

_Not started._

Records, once landed: the shape of the reprocessing static-data entry after the change, and
how a client behaves when reading a cached copy published before it.

## Stage B — Landed cost in ore selection

_Not started._

Records, once landed: how per-batch cost is composed from market price and freight, how the
freight rate reaches the calculation, where the setting is stored and persisted, and what an
unset or zero rate does.

## Stage C — Freight in the calculator output

_Not started._

Records, once landed: what the output shows about volume and freight, and where those figures
come from.

## Missing live SoT found during this work

_None recorded yet._

Reprocessing topics that turn out to be undocumented in live SoT are drafted here first, in
live-doc shape, and roll into `frontend/` only on promote.
