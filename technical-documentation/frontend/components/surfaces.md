# App-shell surfaces (`Styled Components/Paper`, `Context/appShell`)

Live SoT for the app-shell design's panel and recessed-block surfaces: what each component draws, the
sx it sits on, and which layer a given piece of chrome belongs at. Which screens compose these is each
area's own `contents.md`; the rule that a screen reaches a surface through its component rather than
the sx beneath it is [../technical-rules.md](../technical-rules.md) § The app-shell surface has an
owner.

## AppShellPanel and SectionPanel

`AppShellPanel`
([`Styled Components/Paper/AppShellPanel.jsx`](../../../frontend/src/Styled%20Components/Paper/AppShellPanel.jsx))
is the app-shell panel itself: an outlined `Paper` on `appShellSetupSectionPaperSx`, an optional title
and action row, an overflow menu (`enableMenu` / `menuItems`, drawn by [`ActionMenu`](./menus.md)), an
error boundary, and loading and error states (`isLoading`, `isError`, `error`, `loadingVariant`). A
title with no `componentName` names the error boundary itself, so an unlabelled panel is still
distinguishable from another one.

A page frame — a stepper, its viewport and its navigation — is not a panel: `AppShellPanel` would wrap
it in a title header, an error boundary and loading states it has no use for. A frame takes
`appShellSetupSectionPaperSx` on a plain outlined `Paper` instead.

`SectionPanel`
([`Styled Components/Paper/SectionPanel.jsx`](../../../frontend/src/Styled%20Components/Paper/SectionPanel.jsx))
is `AppShellPanel` with a subtitle and spacing between the several children a section of a settings or
onboarding screen is passed — the panel's own content box does not space them on its own.

## InsetSurface

`InsetSurface`
([`Styled Components/Paper/InsetSurface.jsx`](../../../frontend/src/Styled%20Components/Paper/InsetSurface.jsx))
is a recessed block inside a panel — an expanded row, a rate block, a disclosure — on
`appShellInsetSurfaceSx`. It is the surface for content nested inside a panel that is not itself a
panel: a date picker and a clear button inside a dialogue are this, not a section of a page.

## The sx underneath

[`Context/appShell`](../../../frontend/src/Context/appShell) carries the sx these sit on:

| sx | Component above it | Reads as |
|----|---------------------|----------|
| `appShellSetupSectionPaperSx` | `AppShellPanel` / `SectionPanel` | A soft-bordered panel with a tinted fill |
| `appShellNestedCardSx` | `SelectableCard` / `ActionCard` (see [cards.md](./cards.md)), `EntityRow` (see [rows.md](./rows.md)) | A quieter card nested inside a panel |
| `appShellInsetSurfaceSx` | `InsetSurface` | A recessed block, `appShellNestedCardSx`'s neighbour for non-card content |

The module also carries form-control and picker props with no component above them —
`getAppShellPickerSlotProps` and the like — meant to be imported directly rather than wrapped.
