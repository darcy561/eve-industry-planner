# App shell rollout — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md) and
[`../technical-rules.md`](../technical-rules.md) (migration-plans), plus the root masters they defer
to, and [`../../frontend/technical-rules.md`](../../frontend/technical-rules.md) for the SPA surfaces
this plan names. No Go surfaces are in scope.
Live SoT will not be edited until this project is complete and promotion is approved.

**The plan's work is done.** How each part behaves now is [overlay.md](./overlay.md); this file
stays as the record of what was decided and why. The stage table below is the state of it.

## Goal

Every screen on the app-shell design is made of the same pieces, so a panel states what it holds
rather than restyling a surface, and two panels beside each other cannot disagree about what a figure,
a card or a chosen state looks like.

## Why this matters

The design is the target for the SPA and is being rolled out panel by panel, so most screens have not
converted yet. The ones that have, converted before there was anything to convert *onto*: there were
sx helpers under `Context/appShell` and no components above them, so each screen worked out its own
version of the same few shapes.

That has already produced drift rather than duplication alone. First login re-implemented the panel
with a primary-coloured `h6` title where every other panel uses a quiet secondary caption, so the
screens that introduce the app looked unlike it. The nested card surface existed four times at three
radii and four border alphas. A selection card lived in one screen's folder while another screen
imported it across the app, carrying its own copy of the selection, hover and focus styling — and an
accessibility bug with it, claiming a radio role while rendering a checkbox.

None of that is visible as a bug. It is visible as a screen that looks *nearly* right, which is why it
survives review and accumulates.

## The component layer

`Styled Components` now carries the atoms panels compose. Added as consumers needed them, not
speculatively — each has a real caller.

| Atom | What it settles |
|------|-----------------|
| `Figure` | Digits line up; a value the app does not have reads as an em dash rather than a gap or a zero |
| `SignedPercent` | A change, coloured by direction, taking a fraction because that is what a ratio gives |
| `FigureRow` | The label-and-value line a breakdown is made of, and which row closes a block |
| `HeadlineStat` | The figure a panel leads with |
| `StatTile` | A measure, its change and what it was before |
| `PanelFooterMeta` | The quiet line under a panel |
| `FigureCaption` | What a figure is |
| `StatusChip` | A state, named rather than coloured at the call site |
| `SelectableCard` | A card a player picks, as one of a set or on its own |
| `ActionCard` | A card that acts — follows a link, runs an action, or states something there is nothing to do about |
| `InsetSurface` | A recessed area inside a panel |
| `figureToneColour` | A tone, for the places one has to reach something that is not a `Figure` |
| `SectionPanel` | A titled section of a page, and the line explaining it |
| `FormField` | A labelled control: what it is, what it does, and the control |
| `SwitchField` | A setting that is on or off, named on the left |

The last three were added by [accounts-page](../accounts-page/plan.md), which promoted the first two
out of first login at its Stage A and built the third at Stage C. `FormField` labels with
`FigureCaption`, so a control and a figure are named the same way.

`Context/appShell` keeps the sx helpers these sit on: `appShellSetupSectionPaperSx` for a panel and
`appShellNestedCardSx` for a card inside one.

**The layer grows from conversions, not ahead of them.** A shape earns an atom when a second screen
needs it; before that it stays where it is.

**Built:** a row's item actions — see § An item's market actions, and the one place they are assembled. Seven callers shared
a component for this already; what they shared was the wrong shape rather than the wrong place.

## An item's market actions, and the one place they are assembled

`Styled Components/Popover/iconButtons.jsx` wrapped an item's name on seven surfaces — the material
rows, the watchlist and its expanded rows, the Returns output header, the Purchasing material card,
and both reprocessing outputs — and revealed three actions on hover: market data, price history, and
assets.

**Three things were wrong with it**, and they are the reason it was rebuilt rather than patched
again:

- **It was a Modal.** MUI's `Popover` is built on `Modal`, which lays an invisible `position: fixed`
  backdrop over the whole viewport. That backdrop swallowed every pointer event, so the anchor never
  saw the pointer leave and nothing closed the popover but a click. Letting events through the root
  fixed it, but that was a workaround for using a modal to do a non-modal job.
- **It was unreachable on a phone.** `display: { xs: "none" }` hid it outright, so those three
  actions had no route on mobile at all.
- **It was unreachable by keyboard.** Hover was the only way in.

**What it became: the same card, rebuilt.** The actions still appear in a small card above the item's
name while the pointer is on either — that shape was right, and replacing it with icons sitting
inline on the row was a change nobody asked for.

`Styled Components/Item/marketActions.jsx` exports `ItemMarketActions`, taking the same
`children` / `typeID` / `regionID` the popover took, so every caller converted by swapping the
import. What changed is underneath:

- It is built on **`Popper`, not `Popover`**. `Popover` is a `Modal`, and the backdrop was the whole
  defect — it covered the viewport, swallowed the pointer leave that should have closed the card, and
  left a click as the only way out. `Popper` only positions, so there is no backdrop to let events
  through and nothing to dismiss.
- **The wrapper is focusable**, which gives the actions a keyboard route. Hover was the only way into
  the old popover.
- **It is no longer hidden below `sm`**, so the three actions exist on a phone.
- The icons are **larger** than the originals.

A close is delayed by 150ms so the pointer can cross the gap between the name and the card, and the
card cancels that pending close when the pointer arrives on it. Without that the buttons cannot be
reached at all. That delay is not covered by a test: jsdom has no pointer, so it cannot reproduce one
travelling between two elements, and a test written for it passed with the behaviour removed.

`Styled Components/Popover/` is gone — it held only the popover and its test, and the cutover left it
with no callers.

**It is also where these three actions are assembled, and the only place.** Five further
surfaces put them together by hand: the reprocessing mineral card and basic output, the Purchasing
material card, a group's output card, and the Selling market-costs header. Two of those rendered
them *twice* on the same row, once through the atom on the name and again as loose icons beside it.

Taking the rest needed two things the atom lacked. A **`side`**, because a link beside a sale price
must open the market the sale is priced against rather than the one materials were bought on. And a
**standalone mode** for a caller with no name to sit beside — in a card's actions row or a panel
header there is nothing to hover, so the actions sit inline as the content itself.

Two consequences worth stating. The group output card and the market-costs header **gain an assets
button** they did not have, because the component offers all three to a signed-in player; the alternative
was a prop to suppress it, which is a second shape for the same thing. And the mineral card read
`isLoggedIn` through `getState()` during render — a snapshot that never re-rendered on sign-in — so
converting it fixed a bug that was not being looked for.

## A table fits the panel it sits in

Four tables ran off the side of the panel on a narrow window — the cost breakdown, materials and
sourcing, the archive item breakdown and the archived jobs list. A table with nothing to scroll
inside does not shrink to fit: it squeezes its label column to a word a line and overflows anyway,
which is how a cost breakdown came to show "Broker fee to list" down the left edge while its figures
sat outside the panel.

`ScrollingTable` in `Styled Components/Table/tableParts.jsx` is the one implementation — the module
that already owns the shared column header. Below its floor the table scrolls, so every column stays
readable and the overflow stays inside the panel.

**The floor is a theme breakpoint**, named the way the other thirty `breakpoints.up`/`down` calls in
the SPA name them, rather than a pixel figure per table drifting on its own. A breakpoint is a
viewport measure and a table's need is a content one, so a table scrolls somewhat before its columns
would actually collide; that is the price of one vocabulary, and it errs toward scrolling rather than
toward squeezing a column.

Figures never wrap. A number split across two lines cannot be read, and the wrapping is itself what
makes a table demand more width than it has; the item's name is the part that may wrap.

**Nested chrome was taking 73px of a 407px viewport** before any content — 18%. `StepContent` indents
every Edit Job stage beneath its step icon (12px margin, 20px padding, a 1px rail), and `ContentPanel`
padded a fixed 16px each side at every width. The rail earns its place on a wide screen and does not
on a narrow one, so it is kept from `md` up; the panel's padding halves below `sm`. Together that is
41px returned to the content.

## First login sits on the shared surface

The page frame and the support step's cards each drew their own near-miss of a helper that already
existed, which is this project's failure case rather than a second implementation of it.

**The page frame** hand-rolled `appShellSetupSectionPaperSx` at six slightly different values: a
border at alpha 0.22 against the helper's 0.20, backgrounds at 0.84/0.94 against 0.72/0.90, a 4px
blur against 3px, and `md` padding of 3 against 2.5. Only the radius matched. It is now the helper on
an outlined `Paper` — `elevation={0}` with a hand-drawn `border: "1px solid"` was doing by hand what
the variant does, and the helper supplies a `borderColor` with no border to colour otherwise.

**The support step's cards are `ActionCard`.** They were a local `SupportBookendCard`: three
hand-assembled `Paper` branches over a local surface sx, with their own hover, focus and transition
block. Pointing that sx at `appShellNestedCardSx` would have moved the CSS and left the screen still
building its own card, which is not what this project is for — a screen is meant to compose the
component layer, not to restyle a surface. The component went to `Styled Components/Paper/`, beside
the `SelectableCard` it is a sibling of, and the support step is 108 lines where it was 241.

Both atoms make the whole card the control, and a `Paper` given a role and a `tabIndex` is reachable
by Tab but does not get a native button's Enter and Space activation — that is the browser's doing
and does not come with the role. `activateOnEnterOrSpace` in `Styled Components/Paper/cardActivation.js`
is that handler, once, for both.

`ActionCard` and `SelectableCard` split by what the card does. `SelectableCard` is a card a player
**picks**: it carries a radio or checkbox role and a selected state. `ActionCard` is a card that
**acts**: a link role or a button role, and no state of its own. They share the nested-card surface,
so a card that acts and a card that is chosen read as the same object. A card with neither a link nor
an action is inert and takes no role at all, because a control a reader cannot use should not be
announced as one.

**This atom has one caller**, which § The component layer says should not happen yet. The rule is
there to stop a shape being abstracted before anyone knows its real shape; here the shape was already
drawn and already duplicated three ways inside one component, and leaving it in the screen was the
thing that made first login look unlike the pages around it. Taken deliberately rather than by
forgetting the rule.

**Both surface changes are visible**, slightly: the frame's fill and border land where every other
app-shell panel's do, and the cards gain the tinted fill and softer border they were missing. That is
the point of the conversion rather than a side effect of it, but a screenshot would catch it.

**Two screens were checked and left alone.** The **welcome banner** draws no panel surface — its
radius and shadow are on the logo image, and the layer has no atom for a branded image. The **job
card preview** highlights whichever layout is active around a real `JobCardFrame`, and is
deliberately not a control: `SelectableCard`s beside it do the choosing and `previewInteractionBlockSx`
kills its pointer events. Its frame matches the job card on the planner, which is what it is
previewing, so it keeps that styling rather than taking the app-shell selection treatment.

**Tests came first**, as § How a screen converts asks, because none of the three screens had any. The
support step has nine covering the three card modes, the unconfigured-link states and the feedback
flag; they were written against the old hand-built card and pass unchanged against `ActionCard`,
which is what shows the conversion preserved behaviour. `ActionCard` has eight of its own. The page
shell has six covering the step sequence, which button shows where, and the finish path that saves
before it navigates — the save-failure one checked by breaking the guard and watching it fail. The
shell's height animation is **not** covered: it runs on a `ResizeObserver` and a
double-`requestAnimationFrame`, and jsdom has no layout to observe.

## Archive statistics uses the panel, not the panel's surface

Two of the area's seven files drew a panel instead of using one: a `Paper` carrying
`appShellSetupSectionPaperSx`, which is the surface without the component that owns it.

`ArchivedItemBreakdown` was the plainer case. Under the `Paper` it rebuilt `AppShellPanel`'s header
by hand — the same `Grid container spacing={1.5}` with centred items, a secondary-coloured
`caption`/`md: body2` title, and a control opposite it at `sm: 7`/`sm: 5`. All of it is the panel's
own layout, so the conversion deletes it and passes the sort select as the panel's `action`. The
header's `mb: 1` becomes the panel's `mb: 1.5`.

`ArchivedStatsOverview`'s stat card wrapped a single `StatTile`. The tile keeps its own `isLoading`
rather than handing it to the panel: its skeleton is tile-shaped where the panel's fallback is sized
for a panel's worth of content.

**The stat cards now stand equal in a row.** `AppShellPanel` sets `height: "100%"`, and three cards
in a `Grid` row stretch to the tallest of them where a bare `Paper` let each size itself. That is the
uniform row the design wants, and it is a visible change rather than a side effect of tidying.

**Both gain an error boundary they did not have** — the same thing first login's section card gained,
and the reason the component exists rather than the sx helper alone.

**Two files were checked and left as they are.** `panelParts.jsx` holds the area's chart adapters and
its cost-component hook; a local parts file is only a problem when it re-implements a shared shape,
and this one holds logic the layer has no opinion about. `RecalculationNotice` is a plain MUI `Alert`
driven by the shared `useHasChanged`, and there is no alert atom for it to compose.

The area's 139 tests pass unchanged, which says less than it appears to: **nothing asserted the
breakdown's title**, so dropping it would have left the suite green. That assertion is now in
`ArchivedItemBreakdown.test.jsx`, checked by removing the title and watching it fail.

## Archived jobs uses the inset, and a dialogue field is not a section

The area was already composing the layer: the list, the chart panels, the Edit Job archive panel and
the file-months dialogue all use `AppShellPanel`, `ScrollingTable`, `AppShellSelect`, the charts or
`ContentDialogue`. What was left was three surfaces reaching past the components to the sx beneath
them.

`ArchivedJobsList` built its job card and its block card as a `Box` carrying
`appShellInsetSurfaceSx(theme)` and `p: 1.5` — which is `InsetSurface`'s body, value for value. Both
are the component now.

`FileMonthsDialogue`'s `MonthField` was on **`appShellSetupSectionPaperSx`, which is the wrong
surface** rather than the right surface reached the wrong way. That helper is for a section of a
page; a date picker and a Clear button inside a dialogue are a recessed block within one, which is
what `InsetSurface` is for. Using `AppShellPanel` here would have been worse still — a header slot,
an error boundary and loading states around one picker.

**No test asserts these surfaces, and none should.** Each conversion is a verbatim substitution of
the atom's own markup, so `InsetSurface`'s three tests cover the surface and each caller's tests
cover its behaviour. An assertion at the call site would restate what the atom already proves.

## Screens

| Screen | State |
|--------|-------|
| Archive statistics | Converted: stat cards are `StatTile`, `changeDisplay` returns a tone rather than a colour, and the two files that drew their own panel now use `AppShellPanel` |
| First login — section card | Converted: it is `AppShellPanel`, and gains the error boundary and loading states it was doing without |
| First login — choice row | Converted and promoted to `SelectableCard`; the accessibility bug went with it |
| First login — support step | Converted: its cards are `ActionCard`, and the local card component is gone |
| First login — page shell | Converted: the frame is `appShellSetupSectionPaperSx` on an outlined `Paper` |
| First login — main character card | **Gone.** [accounts-page](../accounts-page/plan.md) Stage C replaced it with a card both it and the Accounts page render |
| First login — welcome banner | **Nothing to convert.** Its radius and shadow are on the logo image, not a panel surface, and no atom covers a branded image |
| First login — job card preview | **Keeps its own frame.** It previews the planner's job card, so it matches that card rather than the app-shell selection treatment |
| Additional accounts, and the rest of the Accounts page | **Moved out.** Converts as part of a redesign, which this project does not do → [accounts-page/plan.md](../accounts-page/plan.md) |
| Archived jobs list, archive chart panels, archive jobs panel | Audited: the cards in the list are `InsetSurface`, and the rest already composed the layer |
| File months dialogue | Converted: its month fields are `InsetSurface`, not the section-panel surface |
| Everything else | Predates the design. Converts when the design reaches it, not before |

## How a screen converts

- **Read it before changing it.** These conversions are pattern-shaped but not mechanical: a card
  inside a table cell is not the same as a card in a stack, and a surface may be carrying a size or a
  shadow for a reason.
- **Preserve behaviour exactly.** Tooltips, responsive typography, loading states and disabled states
  are the parts most easily dropped, because they are the parts a screenshot does not show.
- **Take the tests first where there are none.** First login had 1,311 lines and no tests at all, so
  the conversion had nothing to check itself against until they were written.
- **Do not invent an atom for one caller.** If a shape appears once, leave it in the screen.
- **Standardising a drifted value is a visual change.** Say so rather than folding it in silently.
- **Spacing is behaviour.** A section that wrapped its children in a spaced stack is spacing every
  sibling a caller passes it, and a panel component may not. A test rendering one child cannot see the
  difference, so render several.

## Known, not caused here

- **A radiogroup of `SelectableCard`s is not a roving tab stop.** Every card is independently
  reachable by Tab and there is no arrow-key navigation, where the ARIA pattern expects one tab stop
  moved by arrows. It behaves as a set of independently tabbable controls. This predates the component
  and came with it unchanged; fixing it means the card taking its index in the group, which is a change
  to both consumers as well.

## What this project does not do

It does not convert a screen the design has not reached, and it does not redesign anything on the way
past. A screen either draws the shared surface or it draws the old one; a third variant invented
during a conversion is the failure this project exists to undo.

## Stage status

| Stage | Surface | Status |
|-------|---------|--------|
| Phase 1 — project folder and docs | docs | **Done** |
| First login — remaining screens | SPA | **Done** — page shell, and the support step onto a new `ActionCard`; the welcome banner and job card preview keep what they draw |
| Additional accounts — retire the local panel sx | SPA | **Moved to [accounts-page](../accounts-page/plan.md)** Stage B |
| Archive statistics — audit the rest of the area | SPA | **Done** — two files onto `AppShellPanel`; the other five already compose the layer |
| Archived jobs — audit the list, chart panels and archive panel | SPA | **Done** — three surfaces onto `InsetSurface`; the rest already composed the layer |
| Component layer — add atoms as conversions need them | SPA | **Standing** — grows with conversions rather than closing |
| Item actions — one component, rebuilt on Popper | SPA | **Done** — `Styled Components/Item/marketActions.jsx`, ten callers |
| Tables fit their panel — `ScrollingTable`, floors from the theme | SPA | **Done** — four tables |
| Nested chrome gives width back on a narrow window | SPA | **Done** — `StepContent`, `ContentPanel` |

## Start here

Nothing is outstanding. Every screen this project named is converted, and the two areas it flagged
for audit have been read against the component layer.

What remains is standing work rather than a queue: the component layer grows as conversions need it,
and a screen converts when the design reaches it. A screen that predates the design is not a defect.

The pattern the audits kept finding is worth carrying into the next one, and it has a grep:

```
grep -rEn "appShell(SetupSectionPaper|NestedCard|InsetSurface)Sx" --include=*.jsx frontend/src/Components/
```

Those three helpers each have a component above them — `AppShellPanel`, `ActionCard` or
`SelectableCard`, and `InsetSurface` — so a screen naming one of them has the surface without the
component that owns it. That is how a header or a card comes to be redrawn beside the one that
already exists.

**Eight files still name one.** Seven are outside this project's scope — the item tree, the two
group template dialogues, the asset template, the blueprint card, the Edit Job cost-over-time panel
and the Accounts main character card. They are not defects and this project does not claim them:
each converts when the design reaches its screen, or with the redesign that owns it.

The eighth is this project's own `FirstLoginPage`, and it belongs there. A page frame is not a
panel: it holds the stepper, the step viewport and the navigation, and `AppShellPanel` would wrap
all of that in a title header, an error boundary and loading states it has no use for. The helper on
an outlined `Paper` is the right answer for a frame, so the grep names it every time and the answer
is the same every time.

Not every `Context/appShell` import is a candidate. The module also holds form-control and picker
props — `getAppShellPickerSlotProps` and the like — which have no component above them and are meant
to be imported directly; `FileMonthsDialogue` keeps its picker props having moved its surface to
`InsetSurface`.

The Accounts page is not on that list: [accounts-page](../accounts-page/plan.md) converts it as part
of a redesign, and its Stages A and C added `SectionPanel`, `FormField` and `SwitchField` to the
component layer on the way. Read that project's overlay before converting a screen that uses any of
the three.
