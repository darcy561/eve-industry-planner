# Object storage (`services/shared/core/objectstore`)

Live SoT for the shared S3-compatible object store: what a `Backend` is, which buckets exist and who
owns that list, and the market-pages store built on it.

## `Backend`

A key/value store with prefix operations: `Get`, `Put`, `Delete`, `Exists`, `Stat`, `ListKeys`,
`ListChildNames`, `CopyPrefix`, `DeletePrefix`. `S3Backend` dials the stack's SeaweedFS instance.
`MemoryBackend` is an in-process implementation matching the same contract exactly — a missing key is
`ErrNotFound` rather than an empty result, keys are normalised on the way in, `ListKeys` is recursive
and sorted where `ListChildNames` collapses to one level, and what is read back is a copy rather than
a reference into what the store holds. It takes a settable clock, and it is not test-only: any caller
wanting object storage without a store to dial can take it.

## Buckets

| Bucket | Holds | Turns over |
|--------|-------|------------|
| `static-data` (+ `static-data-test`) | The SDE | Per release |
| `market-pages` | A region's raw order-book pages | Hourly |

`objectstore.SeedBucketNames()` is the one list of buckets a deployment must hold. The Deployment Tool
creates and verifies buckets from its own copy, `deployment-tool/internal/dataplane/s3`'s
`AppBuckets()`, in a module that cannot import this package — the two are held together by a committed
fixture, `testing/fixtures/object-store-buckets/buckets.json`, the way the market hub list and the
structure kinds are. A bucket added to one list and not the other is a bucket every service opens and
no deployment ever creates, so this is a prerequisite for adding one rather than a tidy-up afterwards.

A deployment must run `eip up` (or `eip ensure-s3`) before the image carrying a new bucket rolls —
`OpenMarketPages` refuses a bucket that does not exist rather than creating one, since creating buckets
belongs to the Deployment Tool.

## `MarketPages`

`NewMarketPages(backend)` wraps a bucket as the page store for a region's market orders. A page is
held under `region/<id>/page/<n>` so a **304** can be replayed by checking a page is held rather than
refetched, and so a station's prices can be derived from a walk that already happened.
`DropRegionsOlderThan(before)` judges a region by its **newest** page, not its oldest — a walk rewrites
a region page by page, so judging by the oldest page would delete a region mid-walk and the walk would
go on writing pages into a region that had just been dropped.

`Available()` reports whether a store is configured at all, so a caller — the worker's region
walk — degrades to refetching every page rather than failing when object storage is unreachable.

## Topic-only detail

Retention numbers — fourteen days for a tracked station, seven for a region's orphaned pages — and
what registers and retires a market are [worker/market-orders.md](../worker/market-orders.md).
