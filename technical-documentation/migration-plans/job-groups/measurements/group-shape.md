# What a group actually holds

Measured 2026-09-15 against `eve_industry_planner_snapshot`, the restored copy of live. 1 050 groups
across 390 accounts, 31 953 job documents, 4 822 accounts. Collection names in the snapshot are the
pre-rename ones — `user_job_groups`, `user_job_documents`, `users`.

## Members per group

| | avg | p50 | p90 | p99 | max |
|---|---|---|---|---|---|
| `includedJobIDs` length | 14.3 | 8 | 40 | 67 | 118 |

41 groups hold more than 60 members; 254 hold more than 20. The long chain is real but it is the
tail, and the median group is eight jobs.

## Groups and members per account

| | avg | p50 | p90 | max |
|---|---|---|---|---|
| Groups per account (390 accounts holding any) | 2.7 | 1 | 5 | 35 |
| Grouped jobs per account | 38.6 | 8 | 103 | **600** |

The five heaviest accounts, as `{groups, members}`: `{31, 600}`, `{29, 584}`, `{33, 579}`,
`{35, 573}`, `{30, 427}`.

600 job documents at the average size below is roughly 2.4 MB. That figure is why a derived summary
aggregated from job documents on every planner load was rejected: the planner list is drawn on every
session and every planner switch, and it costs nothing today.

## Document sizes

| | avg | p50 | p90 | p99 | max |
|---|---|---|---|---|---|
| Job document (3 000 sampled) | 3 996 B | 3 320 B | 5 697 B | 9 262 B | 259 243 B |
| Group document (all 1 050) | 1 606 B | 1 077 B | 3 464 B | — | 9 374 B |

The 259 KB job document is an outlier worth someone's attention and is not this project's business.

## Outputs versus included types

| | avg | p50 | p90 | p99 | max |
|---|---|---|---|---|---|
| `includedTypeIDs` length | 14.2 | 8 | 40 | — | 100 |
| `outputJobCount` | **2.17** | **1** | 5 | 18 | 42 |

929 of 1 050 groups — **88.5 %** — have four or fewer outputs.

This is the measurement behind § The icons are the outputs. `AvatarGroup max={4}` on the planner card
draws at most four icons, so against a median of eight included types a typical card already shows an
arbitrary four of eight, mixing the product with whatever intermediates and materials sort first.
Against outputs, most cards draw the complete set.

## Where the claimed-ESI set really comes from

155 of 4 822 accounts carry a non-empty `linkedJobs` array **on the user document**, which is what
`linkedSetsFromUserDocument` seeds the account's sets from at login. The sum over group documents
that runs afterwards is a second copy of the same fact, and the incomplete one — an ungrouped job's
links only ever reach the user document.

## How this was measured

```bash
U=$(grep '^MONGO_ROOT_USERNAME=' .env | cut -d= -f2-)
P=$(grep '^MONGO_ROOT_PASSWORD=' .env | cut -d= -f2-)
docker exec "$(docker ps --format '{{.Names}}' | grep eip_mongo)" \
  mongosh --quiet -u "$U" -p "$P" --authenticationDatabase admin \
  eve_industry_planner_snapshot --eval '<aggregation>'
```

Percentiles are nearest-rank over the sorted array; job document sizes are `$bsonSize` over a
`$sample` of 3 000, every other figure is over the full collection.
