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

Not started.

## Stage C — The page

Not started.

## Stage D — Character actions and ESI data status

Not started.

## Stage E — Shared planner access

Not started.

## Missing live SoT found on the way

Documentation gaps this project finds in live SoT are drafted here first and promoted with the rest.

Nothing recorded yet.
