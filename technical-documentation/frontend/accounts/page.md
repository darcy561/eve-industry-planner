# The Accounts page (`Components/Accounts`)

Live SoT for the Accounts page's layout: what section sits where, the account band, token storage,
the corporations section, and community citadel names. Links in this file resolve relative to this
file's own location once folded into live documentation. The roster itself — a linked character's
row, its action menu and its ESI status — is [characters.md](./characters.md). Shared planners is
[planners.md](./planners.md).

## Layout

`AccountsPage` ([`Accounts.jsx`](../../../frontend/src/Components/Accounts/Accounts.jsx)) is one
column of sections, in the order an account is read:

```text
Account                 — the main character, the account id, token storage
Linked characters       — the roster, main first and marked
Corporations            — one row per corporation any linked character belongs to
Planners                — what the account can reach, and how it got in
Community citadel names — the switch beside the title, and what it trades
```

Every section renders on [`SectionPanel`](../components/surfaces.md); nothing on the page uses MUI
`Grid`. The page is a flex item in the layout row it sits in and claims that row's width itself
(`flex: 1, width: "100%"`) rather than shrinking to its widest section.

## The Account band

[`AccountInfo`](../../../frontend/src/Components/Accounts/accountInfo.jsx) is a band, not a list —
one identity, not a row among rows: a 64px portrait, the main character's name, the corporation and
alliance it flies for, the account id under a `FigureCaption` with a copy control, and the token
storage choice. Both this section and first login read who the main character is through
[`useMainCharacter`](../../../frontend/src/Components/Accounts/useMainCharacter.js), which prefers
the roster's own main character and falls back to the account's stored name for a session that has
not built the roster yet.

**The account id stays on the page**, under a caption rather than a labelled row: it identifies the
account to its owner and appears on no surface a planner member reaches.

### Token storage

[`TokenStorageChoice`](../../../frontend/src/Components/Accounts/TokenStorageChoice.jsx) is a
two-option toggle — cloud or this browser — with one line under it saying what the chosen mode means.
It is an account-wide choice made once, which is why it sits on the Account band rather than at the
head of the roster it governs.

Moving it is unchanged either way it goes: to the cloud goes whatever the browser was storing, or
what the roster holds in memory if the browser had nothing; coming back, only what the roster holds,
because the server does not hand its stored copies back to the browser — a reader switching to local
storage is told the linked characters need linking again.

First login carries the same control on its own main-character section, for the characters linked on
that step, and is the one place the two screens still share a control.

## Corporations

[`CorporationsPanel`](../../../frontend/src/Components/Accounts/CorporationsPanel.jsx) draws nothing
when the account belongs to no corporation, and otherwise renders one
[`EntityRow`](../components/rows.md) per corporation any linked character belongs to, through
`CorporationEsiSection` — see [characters.md](./characters.md) § ESI data status for what each row
shows and why a corporation is a section of its own rather than appended under the roster.

## Community citadel names

[`CitadelNamesCommunityPanel`](../../../frontend/src/Components/Accounts/CitadelNamesCommunityPanel.jsx)
is a single switch (Mongo `users.shareCitadelNames`), sitting opposite the section's title rather
than below a paragraph explaining it — `SectionPanel`'s `action` slot is what carries it there. A
one-line summary sits under the heading; beneath it, in an
[`InsetSurface`](../components/surfaces.md), what the application does with the names it is given
and what the reader's current setting costs them. That second line changes with the switch: sharing
says what turning it off loses, not sharing says what is missing while it is off.

[`citadelNames.js`](../../../frontend/src/Components/Accounts/citadelNames.js) holds every fact this
section and first login's own explanation of the same setting state, once each, and both surfaces
compose their copy from it rather than writing it out a second time.

## What the page does at phone width

| Surface | Below `sm` |
|---------|------------|
| A row (`EntityRow`) | The name and the menu keep the first line; state chips take one of their own |
| The ESI status list | The collection and its state keep the line; the age drops beneath them |
| Token storage | The toggle takes the full width, so each option is a real tap target |

The thresholds are the theme's own breakpoints; nothing on this page retargets a component to escape
a layout problem. The Account band keeps a floor on the identity column and a ceiling on the storage
block instead, because the two are flex siblings and the storage choice's sentence otherwise asks for
more width than the identity column can give up.

A section's own control — *Add Account*, the citadel switch — takes its own line below the section's
heading at this width, which is `AppShellPanel`'s header behaviour on every panel that draws one.

## The page is not first login's twin

First login and the Accounts page both introduce an account, for different reasons, and do not share
a design beyond token storage. First login leads with the main-character card and a paragraph
explaining what a main character is; the Accounts page states who the account is and moves on, and
carries no explanation of what linking a character does.
