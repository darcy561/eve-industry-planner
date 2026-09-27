# Every animation the SPA runs, and what happens to it

Counted across `frontend/src`, excluding tests. Reproduce with:

```bash
grep -rnE '<(Fade|Grow|Collapse|Slide|Zoom)([[:space:]>]|$)' --include='*.jsx' frontend/src \
  | grep -v '\.test\.'
```

The pattern has to end each name, and has to allow end of line: a bare `<Zoom` substring also matches
`<ZoomOutMapIcon`, and requiring a space or `>` after the name drops the six sites written as `<Fade`
with its props on the following line.

**33 sites across 17 files.** One is a candidate for `ViewTransition`; the other 32 stay on MUI.

| Component | Sites |
|-----------|-------|
| `Fade` | 21 |
| `Collapse` | 5 |
| `Zoom` | 4 |
| `Slide` | 2 |
| `Grow` | 1 |

## The one candidate

| Site | What it animates | Verdict |
|------|------------------|---------|
| `Components/pageTransition.jsx:44` | The whole page arriving after a navigation, keyed on the route pattern | **S1.** The outlet swap is a route commit, which the router already wraps in `React.startTransition`, and the outgoing page is removed rather than held — the one case in the SPA where a snapshot is the only way to animate what left |

## The 32 that stay

Each animates inside a surface that is already mounted, on a plain state change. None is eligible for a
view transition, and each is the shape MUI is for.

| Site | What it animates |
|------|------------------|
| `Components/snackbar.jsx:71` | The snackbar sliding in over the page |
| `Components/Reprocessing/reprocessingPage.jsx:67,79,86,101` | Panels of the reprocessing page appearing as their data arrives |
| `Components/Reprocessing/basicMineralOutput.jsx:90,110,256,269` | Rows and totals within the basic output panel |
| `Components/Reprocessing/advancedMineralOutput.jsx:312,346,380,627,644` | The same within the advanced panel |
| `Components/Reprocessing/reprocessingSettingsPanel.jsx:98` | The settings panel collapsing |
| `Components/Auth/LoginUI/LoginUI.jsx:57,65,151,188` | Login states zooming between one another |
| `Components/Job Planner/Planner Components/massBuildInfo.jsx:35,88,105` | The mass-build panel sliding in, and two figures inside it |
| `Components/Groups/Accordion/Classic View/ClassicGroupJobCardFrame.jsx:155` | A job card growing into the classic group accordion |
| `Components/Edit Job/.../Archive Jobs Panel/archiveJobsPanel.jsx:185,207` | The archive panel's content and its collapse |
| `Components/Edit Job/.../Materials And Sourcing/materialDrawer.jsx:90` | The child-job drawer opening beside the materials |
| `Components/Edit Job/.../Material Cards/materialExcessBox.jsx:21` | The excess-bought note appearing on a material card |
| `Components/Archive Statistics/ArchivedItemBreakdown.jsx:236` | A breakdown row within the statistics page |
| `Components/Archive Statistics/RecalculationNotice.jsx:35` | The recalculation notice collapsing |
| `Components/Tutorials/tutorialTemplate.jsx:40` | A tutorial card |
| `Styled Components/Item/marketActions.jsx:134` | The market actions revealed on an item |
| `Styled Components/Typography/figures.jsx:544` | A figure's detail collapsing |

## Not in this count

`Styled Components/JobTreeFlow/JobTreeControls.jsx:37` renders `ZoomOutMapIcon` on the dependency
canvas's fit-view button. It is a static icon, not a MUI `Zoom`, and the canvas's own fit animation is
React Flow's `duration` option rather than anything React animates.

`Components/First Login/page/FirstLoginPage.jsx` animates between first-login steps with
`CSSTransition` from `react-transition-group` directly rather than through a MUI component, because MUI
`Slide` ties enter and exit to one axis and the flow needs opposite directions for Continue and Back.
It is a step change inside a mounted page, so it is not a view-transition candidate either, and
[plan.md](../plan.md) § Out of scope says what else is already recorded about it.
