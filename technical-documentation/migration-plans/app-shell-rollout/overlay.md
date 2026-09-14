# App shell rollout — overlay

What changed and how each part works **after** the change. Live docs remain the truth wherever this
file has no entry.

Promote target on go-ahead: [frontend/](../../frontend/contents.md). **There is no live topic for
the component layer yet** — the frontend docs are organised by app area (auth, navigation, editjob,
pricing…) and the shared components cut across all of them. Promotion has to create one rather than
fold these entries into an existing file; see § What promotion has to create.

## The component layer, and the rule that decides what joins it

`frontend/src/Styled Components/` holds the pieces a panel is made of. A screen on the app-shell
design states what it holds and composes these; it does not restyle a surface.

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

`AppShellPanel` is the panel itself: the app-shell surface, an optional title and action, an error
boundary, and loading and error states. `SectionPanel` is it with a subtitle and spacing between
several children.

**A shape earns an atom when a second screen needs it.** Before that it stays in the screen. The
exception is a shape a screen is already hand-building and already repeating inside itself — that is
not speculative, and `ActionCard` was extracted on those grounds with one caller.

### Which card is which

`SelectableCard` is a card a player **picks**: it carries a radio or checkbox role and a selected
state, and the whole card is the control so the hit area matches what a reader thinks they are
clicking. `ActionCard` **acts**: a link role or a button role, and no state of its own. A card with
neither a link nor an action is inert and takes **no role at all**, because a control a reader
cannot use should not be announced as one.

Both sit on `appShellNestedCardSx`, so a card that acts and a card that is chosen read as the same
object.

`activateOnEnterOrSpace` in `Styled Components/Paper/cardActivation.js` is the keyboard half of
"the whole card is the control", shared by both. A `Paper` given a role and a `tabIndex` is
reachable by Tab but does not get a native button's Enter and Space activation — that is the
browser's doing and does not come with the role. Without it a card is focusable and does nothing.

## Reaching the surface without the component

`Context/appShell` holds the sx the components sit on: `appShellSetupSectionPaperSx` for a section,
`appShellNestedCardSx` for a card inside one, `appShellInsetSurfaceSx` for a recessed block. Each has
a component above it.

**A screen naming one of those three directly has the surface without the component that owns it**,
which is how a header or a card comes to be redrawn beside the one that already exists. The audit is
one command:

```
grep -rEn "appShell(SetupSectionPaper|NestedCard|InsetSurface)Sx" --include=*.jsx frontend/src/Components/
```

Eight files still name one. Seven are screens the design has not reached — the item tree, the two
group template dialogues, the asset template, the blueprint card, the Edit Job cost-over-time panel
and the Accounts main character card. They are not defects; each converts when the design reaches
its screen, or with the redesign that owns it.

The eighth is `FirstLoginPage`, and it belongs there: a page frame is not a panel. It holds the
stepper, the step viewport and the navigation, and `AppShellPanel` would wrap all of that in a title
header, an error boundary and loading states it has no use for.

Not every `Context/appShell` import is a candidate. The module also holds form-control and picker
props — `getAppShellPickerSlotProps` and the like — which have no component above them and are meant
to be imported directly.

## What the conversions settled

**First login.** The support step composes `ActionCard` and is 108 lines where it was 241; its local
card component is gone. The page frame is `appShellSetupSectionPaperSx` on an outlined `Paper`,
having hand-rolled that helper at six slightly different values. The welcome banner draws no panel
surface — its radius is on the logo image — and the job card preview keeps a frame matching the
planner card it is a picture of, because it is not a control: the `SelectableCard`s beside it do the
choosing.

**Archive statistics.** The item breakdown had rebuilt `AppShellPanel`'s header by hand, down to the
grid split and the caption colour; it and the stats overview are the panel now, and both gain an
error boundary neither had. The stat cards stand equal in a row, because the panel sets a full
height where a bare `Paper` let each size itself.

**Archived jobs.** The job card and block card in the list are `InsetSurface`. The file-months
dialogue's month field was on the section surface, which is the wrong surface rather than the right
one reached the wrong way — a picker with a Clear button inside a dialogue is a recessed block, not
a section of a page.

**Item market actions** are `Styled Components/Item/marketActions.jsx`, built on `Popper` rather than
`Popover`: `Popover` is a `Modal`, and its invisible viewport-covering backdrop swallowed the pointer
leave that should have closed the card. Ten callers, and it is the only place those three actions are
assembled. It is reachable by keyboard and is no longer hidden below `sm`.

**Tables** fit their panel through `ScrollingTable` in `Styled Components/Table/tableParts.jsx`, with
floors taken from theme breakpoints rather than a pixel figure per table. Figures never wrap; the
item's name is the part that may.

## What promotion has to create

These entries have no live home. `frontend/contents.md` is organised by app area and its Owns
section does not mention the shared components at all, so promotion means a **new topic document**
for the component layer plus a task-map row pointing at it, rather than folding this file into an
existing page.

Suggested shape, following the frontend docs' own convention of naming a folder for the area:
`frontend/components/` with the layer, the card rules and the surface-versus-component audit above.
The name is a promotion-time decision, not one this project should make on its way past.

Two entries belong elsewhere on promotion: the table behaviour is about tables rather than the shell,
and the item market actions are about an item row. Both can stay with the component layer or move to
the area that owns them — worth deciding once rather than duplicating.
