# App release notes

### New Features
- **Archived Jobs Page** — Archived jobs now have somewhere to live. Three tabs: your build statistics with charts, an item-by-item history, and the full list of archived jobs with search, sorting and paging.
- **Restore Jobs** — Bring archived jobs back to the planner: one job on its own, a whole group, or a job with everything linked to it. Jobs return to the group they came from, and any ESI links another job has since claimed are reported rather than silently dropped.
- **Item Statistics** — A tab for one item at a time: what it has cost you over time, whether that is trending up or down, and how each build compares. Item names in the breakdown link straight to it.
- **Dashboard Overview** — Your build figures for this month against last, and which items drove them.
- **Kept as Stock** — How much of what you built you have kept rather than sold, month by month.
- **File by Hand** — Older jobs that ESI never gave a date can be assigned to the months you choose, so they still count towards the right period.

### Changes
- **Job Costs** — A job's cost now includes invention, and broker fees count as market activity. Some figures will move the first time your statistics are rebuilt.
- **Build Stats Dialogue** — Redesigned and split into four blocks, so it is clear what is being archived and what each part cost.
- **Build History Panel** — The Edit Job archive panel is rebuilt around what an item has cost you before: how many builds, the average and the range, the last one, and cost per unit over time. It replaces the older archived job data panel.

### Fixes
- **Linked Jobs** — A second click, or "link all" landing while a click was still pending, could link the same industry run twice, showing it twice and charging its install cost twice.
- **Group Jobs** — A newly built child job did not appear for a job inside a group.
- **Adding Characters** — The authorisation code from EVE SSO now travels over the browser's BroadcastChannel straight to the tab waiting for it, rather than being written to browser storage. Two tabs adding a character at once no longer interfere with each other.

### Tech
- **Faster Statistics** — Archived jobs used to be folded into your figures by an hourly sweep. They are now picked up within minutes of archiving, and restoring a job takes its figures back out again.
- **Firebase** — Removed from the backend entirely.
