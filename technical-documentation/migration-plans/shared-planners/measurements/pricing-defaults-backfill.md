# What the pricing-defaults backfill finds in a real database

Measured against the dev stack's `eve_industry_planner` before the step was committed, to know what
the release is actually going to do rather than what the plan assumes.

```
total account_settings:        13
owing a seed:                   0
no defaultPricing key at all:   0
```

Field coverage across all thirteen: nothing missing. `jobStatuses`, `extrasCategories`,
`predefinedSystemIndexes`, `reprocessingSettings`, `customStructures`, `exemptTypeIDs`,
`schemaVersion` and `defaultMarketLocation` are present on every document.

A representative document:

```json
{"defaultMarketLocation":"jita","defaultOrderType":"sell","schemaVersion":1,
 "defaultPricing":{"buying":{"market":"jita","basis":"sell"},
                   "selling":{"exit":"listed","market":"jita"}}}
```

## What that means for the step

**On this database the step is a no-op, and that is the expected result, not a reason to doubt it.**
The SPA writes the whole settings document whenever any setting changes, and the read-time seed fills
`defaultPricing` before the SPA ever sees the document — so every account that has saved a setting
since the split already has the filled value persisted as a side effect. Dev accounts are exercised
constantly, so all thirteen are in that state.

**The accounts the step exists for are the dormant ones.** An account that has not saved a setting
since the split still has the value filled on every read and never written, which is exactly the state
the step ends. Live carries accounts that dev does not, so its count is expected to be non-zero where
this one is zero. Run the step's dry run first and the number it reports is the real answer.

**No sparse documents here, so nothing to widen.** Worth knowing because the write is a `$set` of the
marshalled struct, and most `ApplicationSettings` fields carry no `omitempty` — a stored document
missing one would gain it as a zero value. On this data that cannot happen because nothing is missing.
It would be behaviourally inert anyway: an absent map and a null map both decode to nil. Live is not
proven to be as complete, so this is stated rather than assumed.

## The write bumps `_meta.lastModified`

`UpsertStructPreservingMeta` sets `_meta.lastModified` on every upsert, so each seeded account's
settings document is stamped as modified. That is harmless because step 1 of the release window is
"stop user traffic, and stop the worker" — nothing is connected to be told about it, and every session
reconnects afterwards. It is recorded because a reader diffing documents across the release will see
the timestamp move on accounts whose settings look otherwise untouched.
