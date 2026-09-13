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

`Context/appShell` keeps the sx helpers these sit on: `appShellSetupSectionPaperSx` for a panel and
`appShellNestedCardSx` for a card inside one.

**The layer grows from conversions, not ahead of them.** A shape earns an atom when a second screen
needs it; before that it stays where it is.

**Wanted, not yet built:** a row's item actions — see § An item's market actions want a row atom.
Seven callers already share a component for this; what they share is the wrong shape rather than the
wrong place.

## An item's market actions want a row atom, not a hover popover

`Styled Components/Popover/iconButtons.jsx` wraps an item's name on seven surfaces — the material
rows, the watchlist and its expanded rows, the Returns output header, the Purchasing material card,
and both reprocessing outputs — and reveals three actions on hover: market data, price history, and
assets.

**Three things are wrong with it as a shape**, and they are the reason it belongs in the component
layer rather than being patched again:

- **It is a Modal.** MUI's `Popover` is built on `Modal`, which lays an invisible `position: fixed`
  backdrop over the whole viewport. That backdrop swallowed every pointer event, so the anchor never
  saw the pointer leave and nothing closed the popover but a click. Fixed by letting events through
  the root, which is a workaround for using a modal to do a non-modal job.
- **It is unreachable on a phone.** `display: { xs: "none" }` hides it outright, so those three
  actions have no route on mobile at all.
- **It is unreachable by keyboard.** Hover is the only way in.

**What it should become: the icons on the row.** Dimmed until the row is hovered or focused on a
pointer device, always visible on touch. No portal, no backdrop, no hover timers, reachable by
keyboard, and it works on mobile — which the present one does not.

That is a **row atom**, which is what makes it this project's: every one of the seven callers is a
row or a card showing an item, and each currently reaches for the popover because there is nothing
else to reach for.

**The popover stays until the atom replaces it.** Seven callers across five areas is not a change to
make piecemeal, and the stuck-backdrop defect is already fixed, so nothing is waiting on this.

## Screens

| Screen | State |
|--------|-------|
| Archive statistics | Stat cards converted to `StatTile`; `changeDisplay` returns a tone rather than a colour. The rest of the area is unconverted |
| First login — section card | Converted: it is `AppShellPanel`, and gains the error boundary and loading states it was doing without |
| First login — choice row | Converted and promoted to `SelectableCard`; the accessibility bug went with it |
| First login — support step | **Not converted.** 242 lines, draws its own surfaces |
| First login — page shell | **Not converted.** 274 lines, its own radius-3 surfaces |
| First login — main character card | **Not converted.** Own nested surface at a drifted border alpha |
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
| Item actions — the row atom replacing the hover popover | SPA | Not started; the popover works meanwhile |

## Start here

The remaining first login screens, because they are the ones already claiming the design while not
using it, and because the atoms they need now exist. The page shell, the welcome banner and the
support step are what is left here.

`FirstLoginMainCharacterCard` and `AdditionalAccounts` are **not** on that list any more:
[accounts-page](../accounts-page/plan.md) takes both, because the character card it would convert to
is the one that project builds, and converting it here first would mean converting it twice.

Not urgent. Cheap once someone is in the file.
