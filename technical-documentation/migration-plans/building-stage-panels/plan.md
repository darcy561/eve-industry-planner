# Building stage panels — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md) and
[`../technical-rules.md`](../technical-rules.md) (migration-plans), plus the root masters they defer
to, and — for the surfaces this plan names — [`../../frontend/technical-rules.md`](../../frontend/technical-rules.md).
Phase 1 (project folder and docs) before any product work.
No Go surface is in scope, so no `go fix -diff` is owed.
Live SoT will not be edited until this project is complete and promotion is approved.

## Goal

The Edit Job Building stage answers one question — **is the plan installed, and when is it due** — as a
checklist of the slots each setup asked for, in a shape that still reads at thirty slots.

## Starting position

Three panels: an information panel of three cost figures, a tab panel holding two card grids, and the
setup strip imported from the Purchasing stage's folder.

| Job | Where it lives now | What is wrong |
|-----|-------------------|---------------|
| Cost | `informationPanel.jsx` | Three figures already stated on Planning and Purchasing, on a stage whose subject is time |
| Find | `availableJobs.jsx`, 413 lines | Clicking a card links it, after an 800ms `setTimeout` that exists so a transition can play |
| Track | `linkedJobs.jsx`, 344 lines | The same card again; progress is a 4px bar and the percentage lives only in a tooltip |
| Plan | `JobSetupInfoFrame.jsx` | States the slots planned; nothing relates them to what is installed beyond a `2/5` in a tab label |

**The two tabs are one list at two stages of one lifecycle**, and splitting them means the app has to
guess which half the reader came for — it opens *Available* while anything is unlinked and *Linked*
once nothing is, then remembers whichever was last left open in `layout.esiJobTab`.

Four further problems are not about layout:

**Drawing one card in two files has produced two contradictions.** Each tab defines a local
`getStatusColor`, and they map the same states to opposite colours: in *Available* ready-to-deliver is
`success` and delivered is `info`; in *Linked* they are reversed. A finished run is green on one tab
and blue on the other, and linking it swaps them — a state change the player did not make, in the one
channel the stage uses to signal state. Separately, `linkedRunSelectors.js` and `LinkedESIJob` both
answer `isReadyToDeliver`, `progressPercent` and `finishesAt`; the selectors take the moment as an
argument, deliberately, so a figure and the words beside it cannot disagree, while the class getter
reads `Date.now()` itself. The tabs use the functions and `job.lastRunToFinish` uses the class.

**The stage never states the thing it exists for.** *Is anything ready to collect*, *when are the
running ones due*, *is all of the plan installed* — none is stated anywhere, and all three are
derivable from what the stage already holds. `job.nextRunToFinish` and `job.lastRunToFinish` are
getters on the job class already, and the **Groups** job cards count down with them; this stage reads
neither.

**Nothing separates a corporation job from a personal one.** `is_corporation` is on every ESI row and
is used only to draw a badge. A player with both has no way to narrow what they are looking through.

**Progress is measured in a way that says nothing.** Industry runs last days, so a percentage is
*going* for almost all of a build's life. The useful figure is the wall-clock moment each run is due,
and the stage shows no date at all.

## Target shape

| Surface | Answers | Absorbs |
|---------|---------|---------|
| **Progress** | What is ready, when the next and last runs land, how much of the plan is installed | The three-figure information panel |
| **Runs** | Which of each setup's slots are filled, and what the game is offering | Both tabs, and the setup-to-reality comparison nothing did |
| **Job costs** | What the build costs besides materials | The setup strip, as the purchasing project already shapes it |

**Sections are setups.** A setup is how the job is planned to be built and is the unit the Edit Job
flow is organised around everywhere else; a structure is one of the inputs its calculations run on.
A setup's place is one label with a fallback — the player's `CustomStructure.name` where the setup
names one, otherwise the size class from `structureID`, with the solar system beside it.

**Linked and offered never share a list.** A row inside a setup is one the reader has linked. What the
matcher found sits in a block of its own, because until it is linked it fills no slot and counting it
would make the setup's own fill count untrue.

## Ordering

The row component runs first because everything else reads from the row model it produces, and
because it is what removes the colour contradiction. Grouping follows immediately: at the scale this
stage exists for, every list on it needs the same rule, and building the lists twice is the thing to
avoid.

## Stages

### Stage A — one row component

**SPA. Correctness and deduplication.**

`availableJobs.jsx` and `linkedJobs.jsx` collapse into one row component and a list that decides each
row's state. One status map, because there is one component. One answer to *is it ready*, because
there is one function taking one clock — the selectors in `linkedRunSelectors.js` survive, being the
ones that take the moment as an argument, and `LinkedESIJob`'s duplicate getters go with them.

Two smaller things go at the same time, because they are in the code being replaced: the link and
unlink writes come out from behind their 800ms `setTimeout` (the transition stays, the write does not
wait for it), and `findCharacterById` stops being called inside the card `map`, where every row reads
the store imperatively during render and none subscribe.

`layoutSelector.jsx` keeps its data fetching and loses its `switch`, which computes a breakpoint and
then branches three ways into the same call.

**Two different fields are called `esiJobTab`, and only one of them is this project's.** The job-level
`layout.esiJobTab`, read by `tabPanel.jsx` to remember which tab was open, goes with the tabs — see
§ Wire compatibility. There is also an `esiJobTab` on **application settings**: `core.js` defaults it,
migrates it onto older documents, merges it and persists it, and `preferences.js` exposes an
`updateEsiJobTab` action. Nothing calls that action and nothing reads that field outside the store's own
plumbing. It is pre-existing dead state that happens to share a name, it is **not in this project's
scope**, and dropping the job-level field must not be read as licence to touch it.

The two are modelled separately on the server as well: `EsiJobTab *string` on the account document and
`ESIJobTab string` on a job's layout. So the job-level field is a client-side layout value nothing
reads once the tabs are gone, and the account-level one is a wire-persisted account field whose removal
is a stored-shape change with its own migration considerations — which is the difference that keeps it
out of a stage-panel rewrite. Removing it belongs to whoever next touches the account settings' stored
shape, or to a follow-up of its own.

**A run the account cannot name is counted but never drawn.** A row resolves its installer with
`findCharacterById` and renders nothing when that returns null, while the slot arithmetic beside it —
whether *Link All* is offered at all, and whether it is disabled for "not enough job slots" — counts
every match. Three matches with one unresolvable and two free slots offers nothing, though the two
that can be linked would fit. Resolving the installer once, for the whole panel, is what removes it:
the rows, the counts and the bulk action then read one list.

**Done when:** one component draws a run in every state; one status vocabulary; `LinkedESIJob`'s
duplicated getters are gone; the writes happen when the control is pressed; characters resolve once in
the row model, and the counts beside them read the same list; the dead switch is gone; tests cover the
states a row can take.

### Stage B — one grouping rule

**SPA.**

**Everything is a group, including a group of one.** A roll-up that collapses only while every field
matches changes shape as a job grows; grouping always removes that — a single row and a group of
thirty are the same construct, one carrying a `×N` and opening. Grouping hides sameness and never
difference: a row disagreeing on any grouped field cannot join its group.

**The keys are the stable facts, never the time.** Runs queued by hand start minutes or hours apart,
so the hour a run lands would scatter one afternoon's work into a row each. Group on run count,
facility, character, ownership and status; show the due times as a **range** on the row.

The same rule serves the schedule, which buckets by hour because there time *is* the subject — each
line holding a spread rather than claiming its runs are identical — and the setup table, which groups
setups agreeing on structure, system, ME/TE, run count and install cost and gains a **Runs** column and
an **Each** column.

**Done when:** no list on the stage has a scrollbar of its own; a thirty-slot job is shorter than a
five-slot job is today; a group of one is indistinguishable from a plain row; a row differing on any
key stays visible.

### Stage C — Progress

**SPA.**

Leads with **what is ready to collect** and **when the next and last runs are due**, states the
absolute time with the relative beside it, and groups runs landing within the same hour. The three
cost figures move to the Job costs panel. `job.nextRunToFinish` and `job.lastRunToFinish` already exist
— this is a mount, not a calculation.

Nothing sits in this panel's header but its title and the kebab: it has no choice to offer, and a
caption drawn with a chevron would promise a menu that is not there.

**Done when:** the ISK figures are gone from this panel; the schedule groups by hour and names its
clock; ready-to-collect is the headline; `nextRunToFinish` / `lastRunToFinish` are read rather than
recomputed.

### Stage D — setups, slots and the match

**SPA.**

A section per setup, headed by its shape with its place underneath, and a **slot strip** — one tick per
job it planned, filled, ready or empty. An **empty slot gets a row**, because it is the only state on
this stage that means the build will not finish as planned, and today it exists only as the difference
between two numbers in a tab label. `jobSlotsOf` already sums `jobCount`.

**Matching a run to a setup has three fidelities**, decided by what the setup was given rather than by
anything the reader does:

| Fidelity | When | What is compared |
|----------|------|------------------|
| Exact | The setup names a custom structure | its stored `stationID` / `structureID` against the run's `station_id`, plus the run count |
| System | The setup names only a size class | the run's facility resolved to a `solar_system_id` against the setup's `systemID`, plus the run count |
| Runs only | The facility will not resolve | the run count alone |

A setup's `structureID` is a **size class**, not a location — `NPC Station`, `Medium`, `Large`,
`X-Large`, `The Fulcrum` — so it cannot be compared with a facility at all. `runCount` against `runs`
is the one field exact on both sides throughout. Setups that cannot be told apart are **pooled into one
section naming both**, with exact counts for the pair; ME and TE change what a run consumes, not how
the in-game job looks, so they cannot separate two setups here.

**Done when:** sections are setups; a slot strip states a setup's fill at a glance; an empty slot is a
row naming its setup; the three fidelities are implemented and a pooled section names every setup in
it; nothing is attributed to a setup it may not belong to.

### Stage E — the offers block

**SPA.**

Everything the matcher found sits in a block of its own, outside every setup, with each row saying
which setup's slots it **would** fill. **Only the rows that fill an empty slot are on screen at rest**;
the rest fold behind one disclosure whose closed line counts them and says in what way they do not
fit — beyond a full setup, a run count no setup planned, a structure no setup builds at, older than
this job. Folded is not filtered: opened, every row keeps its reason and stays linkable.

The bulk action is named for what it takes — **Link the 3**, not *Link all* — so it cannot reach the
fold. Where nothing fits, the fold opens itself rather than leaving a heading over nothing.

**Done when:** no unlinked run appears inside a setup; a found row names the setup it would fill; the
fold summarises by kind rather than by count alone; the bulk action covers the open band only.

### Stage F — the owner filter

**SPA + one account setting. Additive.**

A three-way filter — **Both · Personal · Corp** — **on the offers block header**, because that is the
only list it acts on. It is a way of finding a job among many, not a view over the build: it never
touches a linked run, a setup's fill count, or anything on Progress. Linking a job changes what every
figure says, so a filter that could hide a *linked* run would invite a reader to misread a filtered
stage as an unfilled one.

`hideCompleteMaterials` is the precedent for storing it: an `applicationSettings` field, debounced-saved,
defaulting to **Both**. `is_corporation` is already on every row.

Ownership becomes a **badge in its own column** on every row in both blocks — the field the filter acts
on where it is an offer, and a fact worth seeing on a linked run, since corporation and personal jobs
come out of different slot pools in game.

**Done when:** the filter narrows the offers and nothing else; it says how many it hid; the badge is on
every row; the setting round-trips.

### Stage G — which clock a time is in

**SPA + one account setting. Additive.**

This is the first surface in the job flow to show an **absolute** time — everything before it is
relative through `formatTimeRemaining`, which needs no zone — so it is where the convention is set.

A **“Display times in my local timezone”** checkbox on the **Layout Settings** frame, beside
`displayHelpCards` and `enableCompactLayoutView`. Its helper names the zone the browser reports and the
current offset, **in both states**, because unticked it is describing what ticking would do. The zone
comes from `Intl.DateTimeFormat().resolvedOptions().timeZone`, which the SPA already calls once in
`feedback.js` behind a `typeof Intl !== "undefined"` guard; keep the guard, and where no zone comes
back say so and disable the checkbox.

**The tooltip carries the clock that is not on screen** — on, times read local and the tooltip gives
EVE time; off, the reverse. A panel also states its own zone in a line, because a tooltip cannot be
seen at a glance and a screenshot pasted into a corporation channel has to survive without one.

The resolver lives beside `formatTimeRemaining` in `numberParser.js` and reads the setting once. The
app is currently split — Archive Statistics buckets months in UTC deliberately, `buildHistoryFigures.js`
formats in local — so this is written down rather than left to each surface.

**Done when:** one formatter serves every absolute time; the setting round-trips; the helper names the
detected zone in both states; the tooltip carries the other clock; the guard survives.

### Stage H — mobile

**SPA.**

`Mobile Layout/mobileLayout.jsx` returns `null` and the selector ignores its own breakpoint, so a phone
gets the standard layout: a card grid at one across, inside a tab, inside a 240px scroll region. **A
scroll region inside a scrolling page swallows the flick gesture** — the same trap the Purchasing grid
sets. Grouped, no list is long enough to need one.

The schedule needs no card variant, being already a narrow list. A run row becomes a card keeping its
bar and chip; a group opens as a bottom sheet with the destructive action at the bottom, away from the
handle, naming how many it takes.

**Done when:** the nested scroll region is gone; the row model is shared with the standard layout; the
offers block stays visually distinct from the setup cards; the sheet names what its unlink covers.

## Handed on

**Managing linked ESI jobs across the archive.** Archiving a job sends `jobsToRemove: job.esiJobIDs` to
`addLinkedEsiData`, so a finished build's runs leave `account.linkedJobs` and `findIndustryJobsForItem`
offers them again for about as long as ESI reports a completed job — roughly three months. The ids are
not lost: `job.toDocument()` carries `esi.industryJobs`, so an archived job still records what it
consumed. What was thrown away is the ledger entry saying so, and the ledger is a flat `Set` of ids
with no owner, date or reason, so it can say *spoken for* and nothing else. Unlinking and archiving
both release today and the ledger cannot tell them apart, though only one of them un-uses a run.

**That system is designed separately and this project proposes none of it.** What this stage owes is
only that it not make the consequence cheaper: an offer whose run completed before this job existed is
marked as probably belonging to an archived build, and folds with the other rows that do not fit, where
no bulk action reaches it. That is a heuristic on two dates, it is worded as a guess, and it changes
nothing about the ledger or the archive path. A run completed *after* this job was created can still
belong to another build.

**Recording a setup id on a linked run** would make Stage D's match exact on every path. A job whose
setups all name custom structures is already exact without it, so the field is the fallback for setups
left on the size-class path. One additive field written at link time, its own slice.

## Wire compatibility

| Change | Shape |
|--------|-------|
| Stage F — the owner filter on application settings | **Additive.** A new field with a default |
| Stage G — the local-timezone checkbox on application settings | **Additive.** A new field with a default |
| `layout.esiJobTab` | **Dropped.** The **job-level** field, remembering which of two tabs was open; with one list there is nothing to remember, and a stored value is simply ignored. The identically-named field on application settings is a different thing and is untouched — § Stage A |
| Every other stage | **Client only.** `esi.industryJobs` keeps its meaning and `LinkedESIJob` its fields |

**No migration.** Both new settings have defaults, and the dropped field is read by nothing once the
tabs are gone.

## Design reference

The visual design these stages build to — every surface in both themes, the realistic offers list, the
fold, the three match fidelities, the mobile layouts, a full-page view of the whole stage, and the
reasoning behind each — is the design proposal published for this work:
<https://claude.ai/artifact/JEtV2h6iopGgnbQc9vCJnv>

It is a **design reference, not SoT**: where it and this plan disagree, the plan wins, and both are
superseded by live docs on promote.

| Section | Covers |
|---------|--------|
| §3 | Progress and the due schedule, both themes |
| §4 | Runs under setups, the slot strip, the offers block |
| §4b | Telling setups apart, and the three match fidelities |
| §4c | What the archive system inherits, and the mitigation this stage owes |
| §5 | Thirty slots: the grouping rule applied three times |
| §6 | The two contradictions duplication has caused |
| §7 | The whole stage at page width |
| §8 | Mobile |

The companion proposal for the Purchasing stage, whose row shape, Job costs panel and setup table this
one reuses, is linked from
[purchasing-stage-panels/plan.md](../purchasing-stage-panels/plan.md) § Design reference.

## Stage status

| Stage | Surface | Status |
|-------|---------|--------|
| Phase 1 — project folder and docs | docs | **Done** |
| A — one row component | SPA | Not started |
| B — one grouping rule | SPA | Not started |
| C — Progress | SPA | Not started |
| D — setups, slots and the match | SPA | Not started |
| E — the offers block | SPA | Not started |
| F — the owner filter | SPA + account setting | Not started |
| G — which clock a time is in | SPA + account setting | Not started |
| H — mobile | SPA | Not started |

## Start here

Phase 1 is complete and no product work has begun. **Stage A is the first thing to build**, and like
the purchasing project's Stage A it is worth landing even if the rest is deferred: it removes a
contradiction a player can see, collapses 757 lines of near-identical card into one component, and
gives every later stage a row model to read.

Two things this project depends on and does not own: the shared components from
[purchasing-stage-panels](../purchasing-stage-panels/contents.md), and whatever
[custom-structure-model](../custom-structure-model/contents.md) resolves for a setup's place. If either
promotes before this project starts, read the promoted live docs rather than those project folders.
