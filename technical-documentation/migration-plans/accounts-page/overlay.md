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

**Done. Nothing in the SPA carries an `appearance` prop.**

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

`AccountEntry` is one layout: the outlined card, with the character's portrait,
name, corporation logo and corporation name, and a remove button. The layout that
went was an elevated square row that named no corporation — so the Accounts page
gains the corporation a character belongs to, which it never showed.

Its remove button now carries the character's name as its accessible name. It had
none, so a roster of five offered five buttons a screen reader read identically.

`AdditionalAccounts` went from 528 lines to 400 and titles itself, as a
`SectionPanel` called **Linked characters**. What changed for a reader on the
Accounts page:

- Storage mode is the two `SelectableCard`s, each saying what it means, rather
  than a switch labelled "Store Accounts In Cloud". The switch stated the cloud
  option and left the local one implied; the cards state both.
- The introductory paragraph is the section's subtitle rather than a wall of body
  text, and says the same thing in two sentences instead of two paragraphs.

`firstLoginPanelSx` is gone with it. It was a drifted copy of the **card** surface
standing in for a panel, so moving the section onto the shared panel is a visual
change: a larger radius, a slightly stronger border and the panel's blur. That is
the standardisation the plan called out, not an accident of the merge.

First login renders `AdditionalAccounts` as its own section now rather than
wrapping it in one, because a self-titling section inside a titled section drew
two panels and two headings.

**That step shows two sections where it showed one**, and the heading that covered
both — "Characters & linked accounts" — is gone. The main character card is under
"Your main character" and the roster under "Linked characters". A section that
titles itself cannot be grouped under a heading with something else without
nesting a panel, and being one section on every screen that renders it is the
point of it titling itself. Worth revisiting at Stage C if the two read as
unrelated once the Accounts page puts them side by side.

## Stage C — The page

The Accounts page is a stack of app-shell sections. Nothing on it renders
`ContentPanel` any more.

```
Account               — the main character, and the account id
Linked characters     — the roster, storage mode, and adding one
Community citadel names
```

### The label above a control was already decided

`FormField` hand-wrote an overline label with a literal letter spacing.
`FigureCaption` was already doing that job on nine surfaces across the converted
panels, so `FormField` renders it and a panel now names a control and a number
the same way.

**The six custom-structure field labels look different for it**, in two ways
rather than the one the choice was about:

| | Was | Is |
|---|---|---|
| Colour | `primary.main` | `text.secondary` |
| Case | as written | uppercase |

So "Rig slot 1" reads as "RIG SLOT 1", in the quiet secondary colour the rest of
the design labels with rather than the accent. Nothing is mangled — the
uppercase is a CSS transform, so the text itself is untouched and a screen reader
still reads what was written.

That is the standardisation, not a side effect of it: a label that was a
different colour and a different case from every other label on the design was
exactly the drift worth removing. Worth saying plainly, though, rather than
calling it adopting an answer that already existed — the shared atom does not
match what `FormField` was drawing, and the fields change to meet it.

No new token was added. The plan expected one; what it needed was the one that
existed under a name describing its first caller rather than its shape.

### One card for the main character

[`Accounts/MainCharacterCard.jsx`](../../../frontend/src/Components/Accounts/MainCharacterCard.jsx)
replaces `First Login/accounts/FirstLoginMainCharacterCard.jsx` and the two
label-and-value rows `accountInfo` drew. It takes children, which is how the
Accounts page adds the account id and first login does not.

Its own surface is gone in favour of `appShellNestedCardSx`. That sx names a
border **colour** and leaves the border to the surface, so the card is an
outlined `Paper` — a plain `Stack` carrying the same sx draws no border at all.

**The account id stays on the page**, under a caption rather than in a row
labelled "Account ID:". It identifies the account to its owner and appears
nowhere a planner member can see; § Open questions in the plan is closed.

**`accountInfo` was reading the store through `getState()` during render**, so
the name and id were a snapshot taken once and never updated. Both are
subscriptions now. This was a live defect, not a styling one.

### One wording for citadel names

The Accounts page and the first-login step each carried their own paragraph
explaining community citadel names, and the two had drifted — the Accounts copy
also opened with a stray double quote mid-sentence. Both render
`SHARE_CITADEL_NAMES_EXPLANATION` from
[`Accounts/citadelNames.js`](../../../frontend/src/Components/Accounts/citadelNames.js)
as their section subtitle.

### A switch is a component now

[`Styled Components/Textfield/SwitchField.jsx`](../../../frontend/src/Styled%20Components/Textfield/SwitchField.jsx)
is the label-left, switch-right row. Three call sites assembled their own
`FormControlLabel` with the same four props and the same spacing sx; two of them
are these citadel switches and the third is storage mode's predecessor. It hands
the caller the new state rather than the event, like `AppShellSelect`.

## Stage D — Character actions and ESI data status

Not started.

## Stage E — Shared planner access

Not started.

## Missing live SoT found on the way

Documentation gaps this project finds in live SoT are drafted here first and promoted with the rest.

Nothing recorded yet.
