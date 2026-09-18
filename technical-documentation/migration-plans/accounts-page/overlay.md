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

A linked character's row carries what the application knows about that character's
credentials, a menu of actions on them, and what it holds of each ESI collection.

### The row says whether the credentials work

[`Functions/Auth/esiCredentials/health.js`](../../../frontend/src/Functions/Auth/esiCredentials/health.js)
records, per character, what the last token acquisition found — `ok`, `degraded`
(a failure that may pass), `reauth-required` (the refresh material is spent), or
`unknown` before anything has been asked. The provider writes it from wherever a
token is acquired or adopted, and drops a character's record when it forgets them.

It is kept beside the tokens rather than in Zustand for the reason the tokens are:
a store write would re-render every subscriber of `account.characters` for a value
none of them display. Rows read it through
[`useCredentialHealth`](../../../frontend/src/Components/Auth/Hooks/useCredentialHealth.jsx),
which is `useSyncExternalStore` over the same record. An outcome matching the one
already held is dropped rather than re-stamped — that comparison is by identity,
so a fresh object for an unchanged state would re-render the whole roster on every
background refresh.

`unknown` shows no chip. Saying nothing is the honest answer before anything has
been tried, and a green chip on every row of a healthy roster is noise.

### The action slot

[`Styled Components/Menu/ActionMenu.jsx`](../../../frontend/src/Styled%20Components/Menu/ActionMenu.jsx)
is the overflow menu as an atom: items declared as data, so adding an action is a
table entry. `AppShellPanel` renders it rather than its own copy, which also fixes
the fixed DOM ids the panel used — two panels on a page shared them, and a menu per
character row would have shared them across the roster. Ids come from `useId` now.

A disabled item renders its `disabledReason` as visible secondary text under the
label. A tooltip would have been the obvious place for it and does not work: a
disabled `MenuItem` takes no pointer events, so the tooltip never opens.

Two actions are behind it today, both operations on the character's ESI credentials
or cached data:

| Action | What it does |
|--------|--------------|
| Renew ESI access | `reacquireEsiAccessToken` — drops the held token and acquires another with the same refresh secret |
| Link character again | Replaces the refresh secret through EVE SSO. **Shown in place of renewing** once the secret is spent, because renewing would ask again with the same dead material |
| Clear ESI data | `clearCharacterEsiCache` — removes every React Query entry keyed by the character hash |

**Nothing acquires an ESI token on a schedule** — `getEsiAccessToken` runs at the
point of use, and its buffer decides whether a held token is reused, not when one
is fetched. The main character's is renewed as a side effect of the planner
session rotate; an alt's is not. So a chip reports the last acquisition and will
not correct itself, and one that says the credentials failed carries **how long
ago that was seen**. A spent secret carries no age: it cannot recover, and an age
would only suggest that waiting might help.

Linking again is [`useLinkCharacter`](../../../frontend/src/Components/Accounts/useLinkCharacter.js),
which is also what the roster's *Add Account* runs. The two differ in one thing:
for the roster a character already held is a mistake and is refused as a duplicate;
for a row linking again it is the whole point, and **only the refresh secret is
replaced** — the roster entry, its corporation membership and its cached ESI data
stay as they are. Signing in as a different character replaces nothing and says so,
and an add is counted in analytics where a relink is not.

Two things that surface where a replaced secret has to land:

- **The main character's secret is not stored with the linked ones.**
  `updateLocalRefreshTokens` writes only the linked characters' key and filters the
  main character out; the main character's own lives in `localStorage["Auth"]`,
  which is what a cold reload resumes from. A relink writes through
  `writeClientSecret`, the same function a rotation uses, so it lands in both
  places — otherwise the fix would last until the tab closed and the next start
  would resume from the spent secret it was meant to replace.
- **One sign-in at a time.** Every row calls this hook and so does the roster's
  button, so the in-flight flag is shared between them rather than held per
  component: two EVE popups at once is two sign-ins a reader has to tell apart.

The remove button stays on the row itself. It is the control a reader came to the
row for, and moving it into the menu would be removing it.

`clearCharacterEsiCache` in
[`Functions/EveESI/characterEsiCache.js`](../../../frontend/src/Functions/EveESI/characterEsiCache.js)
is one function rather than the predicate written twice: removing a character
clears the same cache and used to carry its own copy. Corporation-scoped
collections are keyed by corporation and are deliberately left — they are shared by
every member, and one character's clear must not take another's data.

### What is held of each collection

[`Functions/EveESI/prefetch/collectionStatus.js`](../../../frontend/src/Functions/EveESI/prefetch/collectionStatus.js)
answers, for a character and a collection, its state and the age of what is held.
The display is written against that one function, so the durable record that
eventually answers it can replace React Query without the page changing.

The collections table gained an **`esiScope`** per row — the OAuth scope ESI
requires of the token, read from the published ESI specification rather than from
what the application happens to request. A token keeps the scopes it was issued
with, so a character linked before a scope was added reads as lacking access rather
than as failing. `EVE_SCOPE` is not a second copy of this: it is what the
application asks for at sign-in, while these are what each endpoint requires.

**The states the display uses, and the split between a character's list and a corporation's, are
in [plan.md](./plan.md) § ESI data status** — the design is described once, there.

Where they are drawn:

| Surface | Shows |
|---------|-------|
| [`CharacterEsiStatus`](../../../frontend/src/Components/Accounts/CharacterEsiStatus.jsx) | the character-scoped collections, inside that character's own row — the main character's included, since it is a row like any other |
| [`CorporationEsiSection`](../../../frontend/src/Components/Accounts/CorporationEsiSection.jsx) | one row per corporation any linked character belongs to |

Both draw [`EsiStatusList`](../../../frontend/src/Components/Accounts/EsiStatusList.jsx) and open
through `Disclosure`, which mounts its child only while open. Stage F moved both onto the shared row
and the shared disclosure; § Stage F has the detail.

A corporation's scopes are read from the token of the **first** member listed, because that is the
member a corporation query tries first and therefore the one whose access decides what can be
asked for.

Ages come forward on `useCurrentTime` rather than on a cache subscription, so a
list is a reading of the cache as it stood when it was opened, refreshed once a
minute.

**The list says its own limitation in the section**, not only here: nothing records
when a collection was last fetched, so the ages cover this browsing session only
and a collection fetched before it reads as not held. That is the register entry in
[plan.md](./plan.md) § Drawn, not wired, stated where a reader meets it.

`formatTimeSince` in
[`Functions/Helper/numberParser.js`](../../../frontend/src/Functions/Helper/numberParser.js)
phrases an age — "4 minutes ago" — through `Intl.RelativeTimeFormat` in the
reader's locale. `formatTimeDuration` beside it names a length of time ("3H 20M"),
which is a different thing from a point in the past.

## Stage E — Shared planner access

[`PlannersPanel`](../../../frontend/src/Components/Accounts/PlannersPanel.jsx) is
a section of `EntityRow`s, one per planner the account may work in, read from the
same `usePlannersQuery` listing the header's switcher uses.

| The row says | Read from |
|--------------|-----------|
| The planner's name | `plannerDisplayName`, which falls back to the corporation's own name, or "My planner" |
| What kind it is | `kind`. **`named` is not surfaced**: whether a planner document exists yet is the server's business — working in one creates it — so a reader has nothing to do about it and a row that flagged it would be reporting bookkeeping |
| How the account got in | `joinMethod`, as **owner**, **invited**, **member** or **access list** |
| Which one is being worked in | `activePlanner`, so this section and the switcher cannot disagree |

**The switcher is untouched.** Choosing which planner to work in stays in the
header; this section is for seeing and managing them.

A planner wears its owner's own artwork — a corporation or alliance logo from the
owner handle's entity id, and for an account's own planner the character it signs
in as. `EveImageAvatar` grew an `alliance` prop and `eveImage.js` an
`allianceImageUrl` for it; the image server has no default logo for an alliance,
so that one helper has no fallback id where the others do.

A planner that belongs to **no EVE entity** — a custom planner, which the server
models as its own owner kind — wears no artwork at all. Falling through to the
account's own picture would put the reader's face on somebody else's planner.

### Drawn and inert

**Only a custom planner has a menu at all.** Every kind of planner keeps
membership rows and access is the same question for all of them — does this
account hold a row. What differs is whether the provider maintaining those rows
offers any way to change them: a custom planner's does, and an ESI-sourced one
refuses roster mutation with a 403, because you cannot kick somebody out of their
own corporation. [shared-planners](../shared-planners/plan.md) § One planner, four
membership providers puts it plainly — *a UI showing a working-looking invite
button that quietly does nothing is worse than one that is absent*. So a
corporation or alliance row carries its chips and nothing else, and so does the
account's own planner, whose one member cannot leave it.

On a custom planner, inviting a character, seeing the members and leaving are all
in the row menu, disabled, and each says what it waits for. **What each waits on
is in [plan.md](./plan.md) § Drawn, not wired** — a register that empties itself
as controls are wired, and it holds those reasons once.

The one thing worth repeating here: they do not all wait on the same thing.
Telling a reader that leaving waits on the invite API would read as satisfied the
day that API ships, with nothing behind the control.

**Creating a planner is not drawn at all** — there is no creation endpoint, and a
button for a kind of planner the page cannot otherwise explain would be noise
rather than a promise. Leaving is not offered on a planner the account owns.

The plan's sketch of this section had a row saying who invited you. That cannot
ship: `InviteRedemption` carries `invitedBy`, `issuedAt` and `inviteID` as
`json:"-"`, so the server keeps it to itself deliberately. The row says *invited*
and stops.

## Stage F — One row, and the sections around it

The lists of things an account holds are drawn the same way, and the sections are
arranged around that rather than around where each piece happened to be built.

### One row, everywhere

[`Styled Components/Paper/EntityRow.jsx`](../../../frontend/src/Styled%20Components/Paper/EntityRow.jsx)
is the row: artwork, name, a line of context, status chips, actions, and
whatever hangs beneath. `AccountEntry` and `CorporationEsiSection` are both built
on it, so a character and a corporation read as the same kind of object. It is
not `SelectableCard` or `ActionCard` — both of those are a card that *is* a
control, with a role and a hit area to match; this one carries several controls
of its own and is not itself pressable.

`selected` marks the one being worked in, which is what the planners section will
use for the active planner.

### Removing a character is a menu item

It was an icon button on the row; it is now the last item in that row's
`ActionMenu`, coloured for a destructive action. The menu is where an occasional
destructive action belongs, and a roster of inline buttons buries the character
behind its own tooling. Every step of the removal is unchanged — the store, the
corporation list, the cached queries, the cloud or local token, the session
grants.

**The main character's row has no removal at all.** `AccountEntry` takes
`isMain`, which adds the `main` chip and leaves the action out of the table.

### The roster is the whole roster, and it is a column

`AdditionalAccounts` lists every character, the main one first and marked, so the
page has one list rather than a card and a list. First login still shows its own
`MainCharacterCard` above the roster, so it passes `includeMainCharacter={false}`
and its section stays titled **Linked characters** — the same component, told
which roster it is drawing.

The rows are a `Stack`, not items in a `Grid` — as is the storage-mode pair beside
them, since the SPA is moving off `Grid` generally. In a grid each row sized itself to
its content, so the roster drew as two or three columns, **a row that opened its
ESI data reflowed the rest, and characters changed places as their heights
changed**. A column means an opened row pushes what is below it down and nothing
moves sideways.

Adding a character is the section's own control now, opposite its title, rather
than a button above the first row.

### Token storage moved to the account

Where an account's linked-character tokens are kept is an account-wide choice made
once, so it sits on the Account band rather than at the head of the roster, where
it was the first thing a reader met in a section named for characters. Stage B put
it with the roster on the grounds that it governs those characters' tokens, which
is true and is not what settles where it goes.

[`TokenStorageChoice`](../../../frontend/src/Components/Accounts/TokenStorageChoice.jsx)
owns the choice and the move that follows it. The two `SelectableCard`s became a
two-option toggle with **one line saying what the chosen mode means** — the same
shape the citadel switch uses, and it keeps both options explained as a reader
meets them rather than spending half a section on the one they are not on.

The move itself is unchanged: to the cloud goes whatever the browser was storing,
or what the roster holds if it was storing nothing; coming back, only what the
roster holds, because the server does not hand its copies back — which is what the
snackbar on that path has always said.

**First login keeps the choice**, on its own main-character section: it governs the
characters linked on that very step, and an account that linked them under the
default would have to add them again to change it afterwards. That is the one
place the two screens still share a control, and they render it for the same
reason rather than because one inherits the other's design.

`submitCloudLinkedCharacterRefreshTokens` and `buildTokenOverridesFromCharacters`
moved to
[`Functions/Auth/linkedCharacterTokens.js`](../../../frontend/src/Functions/Auth/linkedCharacterTokens.js):
importing a character and switching storage mode both send tokens to the server,
and the two surfaces are now in different components.

### The Account section is a band

[`accountInfo.jsx`](../../../frontend/src/Components/Accounts/accountInfo.jsx) no
longer renders `MainCharacterCard`. It is a 64px portrait, the name, a count of
what the account holds, and the account id — **with a copy control**, because a
36-character identifier exists to be quoted somewhere else. Both screens read who
the main character is through
[`useMainCharacter`](../../../frontend/src/Components/Accounts/useMainCharacter.js)
rather than deriving it twice.

### Corporations are a section

[`CorporationsPanel`](../../../frontend/src/Components/Accounts/CorporationsPanel.jsx)
renders the corporation rows as a section of the page. They were appended inside
the character roster, where a corporation was neither a character nor a section.

### What the page does at phone width

Three things narrow rather than shrink, because the alternative is truncating a
name to make room for a chip:

| Surface | Below `sm` |
|---------|------------|
| A row (`EntityRow`) | The name and the menu keep the first line; the state chips take one of their own |
| The ESI status list | The collection and its state keep the line, and the age drops beneath them |
| Token storage | The toggle takes the full width, so each option is a real tap target |

The thresholds are the theme's own — nothing here retargets a component to a
different breakpoint to escape a layout problem. **A tablet showed why that would
not have helped anyway:** the Account band broke at 768px, above every phone
threshold, because the storage choice carries a sentence and therefore asks for a
wide flex base, and a sibling that may shrink to nothing gives way in proportion —
the identity column rendered one character per line. The fix is a floor on the
identity and a ceiling on the storage block, not a breakpoint.

A section's own control — *Add Account*, the citadel switch — takes its own line
below the heading, which is what `AppShellPanel`'s header has always done at that
width and what the conversion off `Grid` had to preserve for the eighteen panels
that draw it.

**None of this is covered by a test.** jsdom runs no layout and evaluates no media
query, so a breakpoint change is invisible to the suite; what a unit test can hold
is the container's own shape, the way the roster's column is held.

### The page is not first login's twin

The two screens introduce an account for different reasons, and they no longer
share a design. First login leads with `MainCharacterCard` and the paragraph
explaining what a main character is; the Accounts page states who the account is
and moves on. **The Accounts page carries no explanation of what linking a
character does** — a disclosure nobody opens is not worth the control that opens
it — and the paragraph lives in `MainCharacterCard` again rather than in a
constant shared between the two.

### Community citadel names is one decision, stated once

The section led with the whole explanation as its subtitle and put the switch
below it, so a reader met a paragraph before the control it was about. Now the
**switch sits opposite the title** — `SectionPanel` passes an `action` through to
`AppShellPanel`, which always had one — with a one-line summary beneath the
heading and, in an `InsetSurface`, what the application does with the names and
what the current setting costs. The second line changes with the switch: sharing
says what turning it off loses, not sharing says what is missing while it is off.

[`Accounts/citadelNames.js`](../../../frontend/src/Components/Accounts/citadelNames.js)
holds each fact once and composes the two surfaces from them: why a name cannot
simply be read, and what the application does with what it is given. The page's
summary and first login's explanation are built from those rather than written
out twice — the drift between two hand-written wordings is what Stage C fixed
here in the first place, and a third copy beside the switch would have started it
again.

**`SwitchField` keeps its place in the component layer** even though the citadel
switch no longer calls it — the switch moved into the section header, where a
label-left row is not what is wanted. Its shape is still assembled by hand in
several Settings frames, which are not on the app-shell design yet; it is
under-adopted rather than unused, and those screens convert on their own terms.

### Two duplicates found on the way

- `EsiDataDisclosure`, added at Stage D, is **deleted**. `Disclosure` in
  [`Styled Components/Typography/figures.jsx`](../../../frontend/src/Styled%20Components/Typography/figures.jsx)
  already did the job, including mounting its child only while open, and every
  caller now uses it.
- The copy control calls
  [`writeTextToClipboard`](../../../frontend/src/Functions/Clipboard/writeTextToClipboard.js),
  the helper three other surfaces already use, which gained an optional success
  message so a caller copying one named thing can say what it copied.

## Missing live SoT found on the way

Documentation gaps this project finds in live SoT are drafted here first and promoted with the rest.

Nothing recorded yet.
