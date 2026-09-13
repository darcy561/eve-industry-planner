# Accounts page — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md) and
[`../technical-rules.md`](../technical-rules.md) (migration-plans), plus the root masters they defer
to, and [`../../frontend/technical-rules.md`](../../frontend/technical-rules.md) and
[`../../frontend/documentation-rules.md`](../../frontend/documentation-rules.md) for the SPA surfaces
this plan names. Phase 1 (project folder and docs) before any product work. No Go surfaces are in
scope, so no `go fix -diff` sweep applies.
Live SoT will not be edited until this project is complete and promotion is approved.

## Goal

The Accounts page is where an account is managed: the characters linked to it, what the application
holds on each of them, and the planners the account can work in. It is built from the app-shell
component layer, it renders one layout rather than two, and the surfaces it grows are shaped so the
features behind them can land one at a time without the page being redrawn again.

## Why this is its own project

[app-shell-rollout](../app-shell-rollout/plan.md) already owns converting screens onto the shared
surface, and already names this page's `AdditionalAccounts` as the next thing to convert. This work
does not fit inside it, by that project's own boundary:

> It does not convert a screen the design has not reached, and it does not redesign anything on the
> way past. A screen either draws the shared surface or it draws the old one; a third variant
> invented during a conversion is the failure this project exists to undo.

What is wanted here is a conversion **and** a redesign **and** two sections that do not exist. A
conversion preserves behaviour exactly; this changes what the page shows and what a reader can do
from it. Running it as a rollout slice would either smuggle a redesign through a project that forbids
one, or stall the redesign behind a conversion it does not need.

So the split is: **the rollout keeps the mechanical conversions** — the remaining first-login screens,
the Settings tabs, everything the design reaches later — and **this project owns the Accounts page**,
including converting it, because a redesign converts it as a side effect.

The two projects meet at the component layer. This project may **add** an atom to
`Styled Components`, under the rollout's rule that a shape earns one when a second screen needs it,
and the rollout's § The component layer table is where such an atom is recorded on promote.

## Starting position

The page is [`Components/Accounts/Accounts.jsx`](../../../frontend/src/Components/Accounts/Accounts.jsx),
three sections stacked in a grid, reached at `/_protected/accounts`.

| Piece | State |
|-------|-------|
| `Accounts.jsx` | A 12-column grid of three panels. No page-level heading, no shell of its own |
| `accountInfo.jsx` | `ContentPanel`. Character name and **account ID**, as two label/value rows in `LARGE_TEXT_FORMAT` |
| `CitadelNamesCommunityPanel.jsx` | `ContentPanel`. A paragraph and a switch. The copy opens with a stray double quote and is a near-duplicate of the first-login wording |
| `AdditionalAccounts.jsx` | 528 lines. `ContentPanel` **or** a local `firstLoginPanelSx` panel. Owns the SSO popup import flow, the cloud/local storage switch, and the linked-character list |
| `AccountEntry.jsx` | Two complete layouts behind one `appearance` prop. The default is `elevation={3} square` and shows no corporation; the `firstLogin` one is an outlined card that does |

Three things are wrong with it beyond the styling.

**One component renders two unrelated layouts.** `appearance="firstLogin"` is a style fork inside
shared components, and it has spread past this page — into four Settings Custom Structures components
as well. It is not two equal styles: it is the old design and the new one, chosen by a string.

**The panel surface exists here a fourth time.** `firstLoginPanelSx` in `AdditionalAccounts` is a
hand-rolled copy of a surface the design already defines, named for a screen it is not on.

Which surface it copies is worth pinning down before Stage B, because the two candidates are not
interchangeable. It matches **`appShellNestedCardSx`** — same radius of 2, and the same background
alpha of 0.5 dark / 0.88 light — and differs from `appShellSetupSectionPaperSx` on every value it has
in common with it (radius 3, border alpha 0.2, background 0.72/0.9, and a blur this does not have).
So it is a drifted copy of the *card* surface being used where the screen wants a *panel*, which is
why it reads as nearly right. Consolidating it onto the setup-section panel is a visible change
rather than a no-op, and Stage B says which it is taking.

The rollout recorded this as a copy of the panel surface; that attribution is the one thing corrected
here, and the rollout's own row is left to be fixed when this project takes the file.

**The page has no room for what it now needs to say.** A linked character is a row with a name and a
remove button. There is nowhere to act on a character, nothing about what the application holds for
it, and no mention of planners at all — while the account may already reach several.

## What this project takes from the rollout

Used as they are, not rebuilt: `AppShellPanel`, `SelectableCard`, `InsetSurface`, `StatusChip`,
`AppShellSelect`, `Figure` and the `appShell` sx helpers under
[`Context/appShell`](../../../frontend/src/Context/appShell).

Two shells currently live under `Components/First Login/shared/` and are already imported across
trees — `FirstLoginSetupSection` (an `AppShellPanel` with a subtitle) and `FirstLoginStructureFormField`
(an overline label, a description and a control). Both are general, both have a caller outside first
login already, and this page needs both. They move into `Styled Components` under names that are not
first-login's, which retires the cross-tree import at the same time.

## The page

One column of sections rather than a grid, because every section is full width and a grid of one
column is a grid for no reason.

```
Accounts
├── Account                     — main character, account identity
├── Linked characters           — the roster, storage mode, per-character actions
│     └── (per character) ESI data status, expanded on demand
├── Shared planners             — what this account can reach, and how
└── Community citadel names     — one switch, and why it is offered
```

An earlier reading of this grouped citadel names and storage mode into a `Preferences` section, on
the grounds that both are settings a reader visits once. Stage B settled it the other way: **storage
mode belongs to the roster it governs**, because it decides where those characters' tokens are kept
and means nothing without them. That leaves citadel names alone, so it keeps a section of its own
rather than a section named for being miscellaneous.

## The character row

One component for every character, replacing both branches of `AccountEntry` and absorbing
`FirstLoginMainCharacterCard`. Main and linked differ in portrait size, in whether a remove action is
offered, and in the description beneath — not in layout, which is why there were two.

```
┌──────────────────────────────────────────────────────────────────┐
│ ( ) Character Name                            [status] [⋮]  [×]  │
│  ⌄  ▣ Corporation Name                                           │
│                                                                  │
│  › ESI data                                        (collapsed)   │
└──────────────────────────────────────────────────────────────────┘
```

Built on `appShellNestedCardSx`, the card surface the design already defines. The corporation logo
and name stay — they are on the first-login branch today and are the more useful of the two layouts.
EVE's own artwork stays for both the portrait and the corporation logo.

The row carries one **status** marker for the character as a whole, as a `StatusChip`: whether the
application can currently use this character's credentials at all. That is a different question from
any individual collection's freshness, and belongs on the row rather than inside the expansion,
because it is the reason a reader opens the expansion.

## The action slot

Each character row carries a slot for actions on that character. The candidates named — refresh
token, clear ESI cache, and more later — are all **operations on this character's ESI credentials or
cached data**, which is what makes them one group rather than a menu of odds and ends.

They go in an overflow menu on the row, and this is the one place to argue for it rather than
against it. The house rule is that a redesign must keep existing controls reachable on the page and
that tidying controls into a kebab counts as removing them. That rule protects **controls that are
already there**: the remove button stays visible, as it is today. These are new, they are
per-character maintenance actions rather than things a reader came to the page to do, and there will
be several — an inline row of four buttons per character, repeated down a roster, buries the character
behind its own tooling. If any of them turns out to be something a reader reaches for often, it earns
a visible place and comes out of the menu.

`AppShellPanel` already has `enableMenu` / `menuItems`, so the shape exists; what it does not have is
a per-row equivalent, and that is the atom this section adds.

Actions are declared as data — label, handler, disabled reason — so adding one is a table entry rather
than a change to the row. An action with nothing behind it yet is listed and disabled, carrying the
reason, rather than omitted: a reader can see the application intends to offer it.

## ESI data status

Per collection, with an age. The unit is the collection because that is the unit the application
actually fetches, and a single "healthy" verdict per character hides the case that matters — one
collection failing while the rest are fine.

The SoT already exists:
[`Functions/EveESI/prefetch/collections.js`](../../../frontend/src/Functions/EveESI/prefetch/collections.js)
is a frozen table of 16 collections, each with a `key`, a `name`, a `scope` (character, corporation,
corporation-division) and a `phase` (first paint, deferred, on demand). The status list is built from
that table, not from a second list written beside it — a hard-coded list of collection names on this
page would be a parallel copy of a table that already exists.

```
ESI data
┌──────────────────────────────────────────────────────────────────┐
│ Character Skills              ✓ fresh          4 minutes ago     │
│ Character Blueprints          ✓ fresh          4 minutes ago     │
│ Character Industry Jobs       ⚠ stale          3 hours ago       │
│ Character Assets              · on demand      not loaded        │
│ Corporation Blueprints        ✗ unavailable    no access         │
└──────────────────────────────────────────────────────────────────┘
```

Four states, each meaning something a reader can act on:

- **fresh** — held, and recent enough to trust.
- **stale** — held, but older than the collection's own refresh expectation.
- **on demand** — not fetched at login by design (`PHASE.ON_DEMAND`), so absence is correct rather
  than a fault. Shown so its absence is not read as one.
- **unavailable** — the character's token was not issued with the scope this collection needs, or
  ESI refused it. `scopesFromAccessToken` in
  [`Functions/Auth/esiCredentials/tokenScopes.js`](../../../frontend/src/Functions/Auth/esiCredentials/tokenScopes.js)
  already answers the scope half: a token keeps the scopes it was authorised with, so a character
  linked before a scope was added genuinely cannot serve that collection until it is re-authorised.

A corporation-scoped collection is shown once per corporation rather than once per character, because
that is how it is fetched. The one trap worth recording: corporation **assets** are visibility-limited
per character while corporation **blueprints** are not, so the two corporation rows do not mean the
same thing and must not be collapsed into one.

The expansion is rendered only while open. A per-collection status list for every character on the
roster is real work, and a closed disclosure that computes anyway is the failure the dialogue rule
names.

### What the status section is waiting on

Nothing records when a collection was last successfully fetched, per character, in a form the page can
read. React Query holds `dataUpdatedAt` per query, which covers freshness for collections already
fetched **in this session**, and answers nothing for a collection that has not been requested or for a
session that has just started.

So the section lands in two parts. The **display** is built against a single function that answers, for
a character and a collection, its state and its age. The **source** behind that function starts as
what React Query can answer today, and is replaced when something durable exists. The page does not
learn where the answer came from.

This is a gap to fill, not a defect to fix: nothing is broken today, because nothing shows this
information at all.

## Shared planner access

The account may already reach several planners — [shared-planners](../shared-planners/plan.md) stages
A, B and C have landed and E is partly in — and the page says nothing about it. A reader's only sight
of a planner is the switcher in the header.

Read-only against the listing that exists, plus a management surface drawn but not fully wired.
`usePlannersQuery` returns `{owner, kind, name, named, joinMethod}` per planner today, which is enough
for the roster:

```
Shared planners
┌──────────────────────────────────────────────────────────────────┐
│ My planner                    account     owner        [active]  │
│ Hard Knocks Inc.              corporation member                 │
│   ⌄ 4 members · joined via corporation                           │
│ Some Custom Planner           custom      invited                │
│   ⌄ 2 members · invited by Character Name          [Leave]       │
│                                                                  │
│                                       [Create planner] [Invite]  │
└──────────────────────────────────────────────────────────────────┘
```

**Join method is the useful column**, not a role: `JoinMethod` is a discriminated union whose set
branch *is* the method — owner, invite, entity member, access list — and a membership row deliberately
carries no role, because a permission model would bring its own vocabulary. So the section says why an
account is in a planner and does not imply a permission it cannot answer.

The planner switcher in the header is left alone. This section is about seeing and managing planners,
not about choosing which one you are working in.

Drawn but not wired here: the member roster (no endpoint lists members), invite creation and
revocation, and leaving a planner. Invites exist server-side as Redis records with a redemption path,
so the gap is an API surface and a client, not a mechanism.

## Drawn, not wired

The page will ship with controls that do nothing yet. That is deliberate and is the point of designing
the whole shape at once, but it has a cost: a disabled button is indistinguishable from a broken one
unless the page says which it is.

So every such control states why it is inert, in the control itself rather than only in this document
— the same discipline the SPA already applies to a location whose name cannot be resolved, which is
shown as unreadable rather than dropped. A reader must never be left wondering whether they have found
a bug.

This section is the register of them, and a control leaves it when it is wired.

| Control | Waiting on |
|---------|-----------|
| Per-collection ESI age | A durable per-character, per-collection fetch record — see § What the status section is waiting on |
| Character actions beyond refresh and cache clear | The actions themselves; the slot takes them as table entries |
| Planner member roster | An endpoint that lists a planner's members |
| Create planner / Invite / Leave | shared-planners Stage E's outstanding revocation path and an invite API surface |

## Wire compatibility

No stored document shape changes and no cross-process surface moves, so the SPA changes here are
**additive** as far as the wire is concerned. The two consumed endpoints — the planners listing and
whatever eventually answers collection freshness — are read-only from this page's side. When the
status section's durable source is designed, it will need its own compatibility note; it does not have
one yet because it does not exist.

## Stages

### Stage A — The shared shells move

`FirstLoginSetupSection` and `FirstLoginStructureFormField` move into `Styled Components` as
`SectionPanel` and `FormField`, and every importer is converted.

Independent of every other stage and of the open design questions, which is why it is first.

Intended as a no-op, and it is one visually. It is not quite one in behaviour: making a shell general
exposed two things it was doing because it had only ever had one caller — a hardcoded error-boundary
label, and label lines rendered whether or not there was anything to put in them. Both are fixed
here rather than carried into a shared component, and [overlay.md](./overlay.md) § Stage A records
them.

### Stage B — The `appearance` fork is deleted

The six components carrying `appearance` lose it, and the app-shell branch becomes the only branch:
`AccountEntry`, `AdditionalAccounts`, and the four Settings Custom Structures components.

**This changes the Settings → Custom Structures tab's appearance**, which is a screen this project
does not otherwise touch. That is the agreed consequence of having one design rather than two, and it
is recorded here rather than folded in silently. `customStructuresFrame` and
`FirstLoginCustomStructures` are the same three-stage flow behind different wrappers and collapse into
one component both callers render.

The storage-mode control keeps the `SelectableCard` pair rather than the bare switch: it explains what
local and cloud storage each mean, which the switch does not, and it is the branch that survives when
the fork is deleted.

`firstLoginPanelSx` goes with it, onto the **section shell** — the thing it is standing in for is a
panel, whatever it was copied from. Because it is a drifted copy of the card surface rather than the
panel one (see § Starting position), that is a visual change: the section gains the panel's larger
radius, its slightly stronger border and its blur. Standardising a drifted value is a visual change
and is called out rather than folded in.

### The label above a control is not settled

`FormField` styles its label with a hand-written `variant="overline"` — a literal letter spacing and
two literal line heights, with no token behind them. It was moved verbatim at Stage A, so it is
visually unchanged, but it is not standardised the way the section panel is.

Two things make that worth deciding rather than leaving:

- **The overline is the minority idiom.** Two places in the SPA use it; **twenty** use
  `variant="subtitle2"` for the same job, including `AdditionalAccounts`,
  `FirstLoginCustomStructures` and `FirstLoginPlannerSetupStep` — files this project rewrites. A
  shared component currently blesses the rarer of the two.
- **`Context/appShell` has no label token.** It covers surfaces, form controls, menus, sliders,
  pickers and data grids, and `appShellHelperTextSx` is for the line *below* a control. There is
  nothing for `FormField` to read from.

**Settled at Stage C: neither.** The design already had a label — `FigureCaption`, on nine surfaces
across the converted panels, naming what a figure is. It is caption weight, secondary, uppercase, and
carries the same `0.06em` spacing `FormField` was hand-writing. `FormField` renders it, so a control
and a figure are named the same way and no token was added: the one that was wanted already existed
under a name that described its first caller rather than its shape.

### Stage C — The page

`Accounts.jsx` becomes the section stack. `AccountInfo` and `CitadelNamesCommunityPanel` move onto the
shared section shell, the duplicated citadel copy becomes one exported string, and the character row
replaces both `AccountEntry` layouts and `FirstLoginMainCharacterCard`.

The account ID's place on the page is decided here — see § Open questions.

### Stage D — The action slot and ESI status

The per-row action menu, with refresh token and clear ESI cache behind it, and the per-collection
status expansion built on the collections table against the freshness function.

### Stage E — Shared planners

The section, read-only against the planners listing, with the management controls drawn and inert.

## Stage status

| Stage | Surface | Status |
|-------|---------|--------|
| Phase 1 — project folder and docs | docs | **Done** |
| A — the shared shells move | SPA | **Landed.** `SectionPanel` and `FormField` are in `Styled Components`, all eight call sites converted, the originals deleted and the Settings-into-first-login import retired. Two defects fixed on the way — see [overlay.md](./overlay.md) § Stage A |
| B — the `appearance` fork is deleted | SPA | **Landed.** Nothing in the SPA carries an `appearance` prop. The four custom-structure components render one layout and share one `CustomStructuresForm`; `AccountEntry` and `AdditionalAccounts` render one each, the latter titling itself as a section. Settings → Custom Structures and the Accounts page both have the app-shell look — see [overlay.md](./overlay.md) § Stage B |
| C — the page | SPA | **Landed.** The page is a stack of app-shell sections, one `MainCharacterCard` serves both screens, the citadel copy is one string, and `FormField` reads `FigureCaption` rather than its own label. The account id stays — see [overlay.md](./overlay.md) § Stage C |
| D — the action slot and ESI status | SPA | Not started |
| E — shared planners | SPA | Not started |

## Testing

The whole surface is untested today: `AdditionalAccounts`, `AccountEntry`, `AccountInfo`,
`CitadelNamesCommunityPanel` and all four Custom Structures components have no tests at all, and the
SSO popup import flow in `AdditionalAccounts` is the most intricate thing on the page.

The rollout's rule applies — *take the tests first where there are none* — so each stage writes the
tests for what it is about to change before changing it, colocated beside the module, with anything
reusable in [`frontend/src/tests/`](../../../frontend/src/tests/).

Stage B is the one where this is not optional: deleting a branch from six components with no coverage
is how a working screen is quietly lost.

## Open questions

- **Which character actions exist beyond the first two.** Refresh token and clear ESI cache are named;
  the slot takes a table, so the rest can arrive later without the row changing.
