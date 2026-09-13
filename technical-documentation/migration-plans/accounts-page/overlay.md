# Accounts page — behaviour overlay

How the parts this project has changed work **now**, while the project is in flight. Lay this over
live SPA documentation: where this file describes a surface, it wins; where it is silent,
[frontend/](../../frontend/contents.md) remains the truth.

Sections are written as their stage lands, not before. A stage with nothing under it here has not
changed anything yet.

## Stage A — The shared section and field shells

Two shells that were first login's are now the SPA's, under names that say what they
are rather than where they came from.

| Now | Was |
|-----|-----|
| [`Styled Components/Paper/SectionPanel.jsx`](../../../frontend/src/Styled%20Components/Paper/SectionPanel.jsx) | `Components/First Login/shared/FirstLoginSetupSection.jsx` |
| [`Styled Components/Textfield/FormField.jsx`](../../../frontend/src/Styled%20Components/Textfield/FormField.jsx) | `Components/First Login/shared/FirstLoginStructureFormField.jsx` |

`SectionPanel` is a titled `AppShellPanel` with an optional subtitle, spacing the
several children a section is passed. `FormField` is an overline label, a
description and the control beneath them.

Both originals are deleted rather than left forwarding, and all eight call sites
call the new names — three first-login steps for the section, and one first-login
step plus the three Settings custom-structure components for the field. The
cross-tree import that had Settings reaching into `First Login/shared/` is gone
with them.

**Two behaviour changes**, neither of them the styling:

- `SectionPanel` takes a `componentName` for its error boundary, and **passes it
  through without a fallback of its own**. The original hardcoded
  `"FirstLoginSetupSection"`, so every section on every page reported one label to
  Sentry and two failing sections could not be told apart. No caller passes the
  prop today, so what names a section is its title — `AppShellPanel` already falls
  back to it. A constant here would have kept the defect under a new spelling,
  which is what the first attempt did.
- `FormField` renders the label and description lines only when it is given them.
  The original rendered both unconditionally, so the citadel-names switch — which
  is wrapped for its spacing alone and passes neither — had two empty
  `Typography` elements around it.

Both are covered: `SectionPanel.test.jsx` carries the moved tests plus one for the
boundary, and `FormField.test.jsx` is new, the original having had none.

## Stage B — One layout per component

**Custom structures: done. Accounts: not started.**

### Custom structures

The four components under
[`Settings/Standard Layout/Custom Structures/`](../../../frontend/src/Components/Settings/Standard%20Layout/Custom%20Structures)
render one layout. The `appearance` prop is gone from all of them, and the
app-shell branch is what survived.

**Settings → Custom Structures looks different as a result**, which is the agreed
consequence of having one design rather than two. What changed there: fields carry
a heading and a description, controls are outlined rather than underlined, and a
saved structure's card carries its two actions as icons in the corner instead of a
button row beneath it. The figures on a card, and what the actions do, are
unchanged.

`currentStructures.jsx` went from 460 lines to 296 — most of the difference is a
second copy of the card body, written once per layout.

One component now serves both screens:

| Now | Was |
|-----|-----|
| [`Custom Structures/CustomStructuresForm.jsx`](../../../frontend/src/Components/Settings/Standard%20Layout/Custom%20Structures/CustomStructuresForm.jsx) | `Settings/Standard Layout/customStructuresFrame.jsx` **and** `First Login/planner-setup/FirstLoginCustomStructures.jsx` |

The two frames were the same three-stage flow — choose a job type, describe a
structure, see what you have — wrapped in different surfaces. The merged one is
built from `SectionPanel`, so first login's bespoke panels are gone and Settings
gains the sections it did not have. `settingsPage.jsx` and
`FirstLoginPlannerSetupStep.jsx` both render it.

The Settings frame's `height: 100vh` and overflow handling were not carried over:
the tab panel around it already supplies both, and the frame was fighting its own
container.

**Tests were written first and against the old code**, so they describe what the
branch deletion had to preserve rather than whatever it produced — the point being
that a test written after the fact only records the result. `currentStructures`
carries one per job type, because each used to have its own card body on each of
two layouts and one body serves them all now.

### Accounts

Not started. `AdditionalAccounts` and `AccountEntry` still carry the prop.

## Stage C — The page

Not started.

## Stage D — Character actions and ESI data status

Not started.

## Stage E — Shared planner access

Not started.

## Missing live SoT found on the way

Documentation gaps this project finds in live SoT are drafted here first and promoted with the rest.

Nothing recorded yet.
