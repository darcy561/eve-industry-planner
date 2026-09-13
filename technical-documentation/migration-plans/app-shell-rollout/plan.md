# App shell rollout — plan

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md) and
[`../technical-rules.md`](../technical-rules.md) (migration-plans), plus the root masters they defer
to, and [`../../frontend/technical-rules.md`](../../frontend/technical-rules.md) for the SPA surfaces
this plan names. No Go surfaces are in scope.
Live SoT will not be edited until this project is complete and promotion is approved.

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

## Screens

| Screen | State |
|--------|-------|
| Archive statistics | Stat cards converted to `StatTile`; `changeDisplay` returns a tone rather than a colour. The rest of the area is unconverted |
| First login — section card | Converted: it is `AppShellPanel`, and gains the error boundary and loading states it was doing without |
| First login — choice row | Converted and promoted to `SelectableCard`; the accessibility bug went with it |
| First login — support step | **Not converted.** 242 lines, draws its own surfaces |
| First login — page shell | **Not converted.** 274 lines, its own radius-3 surfaces |
| First login — main character card | **Gone.** [accounts-page](../accounts-page/plan.md) Stage C replaced it with a card both it and the Accounts page render |
| First login — welcome banner | **Not converted.** Own surface and shadow |
| Additional accounts, and the rest of the Accounts page | **Moved out.** Converts as part of a redesign, which this project does not do → [accounts-page/plan.md](../accounts-page/plan.md) |
| Archived jobs list, archive chart panels, archive jobs panel | On `AppShellPanel` already; not audited against the component layer |
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
| First login — remaining screens | SPA | Not started |
| Additional accounts — retire the local panel sx | SPA | **Moved to [accounts-page](../accounts-page/plan.md)** Stage B |
| Archive statistics — audit the rest of the area | SPA | Not started |
| Component layer — add atoms as conversions need them | SPA | Ongoing |
| Item actions — one component, rebuilt on Popper | SPA | **Done** — `Styled Components/Item/marketActions.jsx`, ten callers |
| Tables fit their panel — `ScrollingTable`, floors from the theme | SPA | **Done** — four tables |
| Nested chrome gives width back on a narrow window | SPA | **Done** — `StepContent`, `ContentPanel` |

## Start here

The remaining first login screens, because they are the ones already claiming the design while not
using it, and because the atoms they need now exist. The page shell, the welcome banner and the
support step are what is left here.

The Accounts page and the first-login accounts step are not on that list:
[accounts-page](../accounts-page/plan.md) has converted both, and its Stages A and C added
`SectionPanel`, `FormField` and `SwitchField` to the component layer on the way. Read that project's
overlay before converting a screen that uses any of the three.

Not urgent. Cheap once someone is in the file.
