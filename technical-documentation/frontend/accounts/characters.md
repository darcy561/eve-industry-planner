# Linked characters (`Components/Accounts`)

Live SoT for the character roster on the Accounts page: the row, what it says about a character's
credentials, its action menu, and what it shows of each ESI collection. Links in this file resolve
relative to this file's own location once folded into live documentation. Page layout is
[page.md](./page.md); shared planners is [planners.md](./planners.md).

## The roster

[`AdditionalAccounts`](../../../frontend/src/Components/Accounts/AdditionalAccounts.jsx) lists every
character the account holds, the main one first and marked, as a `Stack` — not a `Grid` — so an
opened row pushes what is below it down rather than reflowing the roster sideways. First login draws
its own main-character card above the same list and passes `includeMainCharacter={false}`, so the two
screens share one component told which roster it is drawing.

## The character row

[`AccountEntry`](../../../frontend/src/Components/Accounts/AccountEntry.jsx) is one
[`EntityRow`](../components/rows.md) per character: portrait, name, the character's corporation logo
and name as its context line, status chips, an action menu, and — beneath the row — an ESI status
disclosure. `isMain` adds the `main` chip and leaves the removal action out of the menu, because the
account signs in as its main character.

## Credentials and the action menu

The row's `ActionMenu` (see [components/menus.md](../components/menus.md)) carries what can be done
to a character's ESI credentials or cached data:

| Action | What it does |
|--------|--------------|
| Renew ESI access | Acquires a fresh access token with the same refresh material |
| Link character again | Replaces the refresh secret through EVE SSO. Shown in place of renewing once the secret is spent, because renewing cannot mend refresh material that has already been rejected |
| Clear ESI data | Removes every cached ESI collection held for this character |
| Remove character | Destructive, and absent from the main character's row |

A chip beside the name reports whether the application can currently use the character's
credentials at all — a different question from any one collection's freshness — read through
`useCredentialHealth` (see [frontend/auth/spa.md](../auth/spa.md) § Credential health). `unknown`
shows no chip: a green chip on every row of a healthy roster is noise, and saying nothing is the
honest answer before anything has been tried. A `degraded` chip carries how long ago that failure
was seen, because nothing acquires a token on a schedule — a chip reporting the last acquisition will
not correct itself on its own, and an age says so. A spent secret (`reauth-required`) carries no age:
it cannot recover however long ago it was seen, so an age would only suggest waiting might help.

### Linking a character again

[`useLinkCharacter`](../../../frontend/src/Components/Accounts/useLinkCharacter.js) is the same hook
behind the roster's own *Add Account* and a row's *Link character again* — one EVE SSO popup
mechanism, shared so that only one sign-in can be in flight for the account at a time. What differs
is whether a character already in the roster is a mistake (adding) or the whole point (linking
again): a relink replaces only the refresh secret through `writeClientSecret` (see
[frontend/auth/spa.md](../auth/spa.md) § Acquiring an ESI access token) — the roster entry, its
corporation membership and its cached ESI data are left as they are — and re-warms that character's
collections through the login prefetch (see
[esi-collections/prefetch.md](../esi-collections/prefetch.md) § The scheduler), because what it
could not load while its credentials were spent is worth asking for again. An add is counted in analytics; a relink is not, since the character was
already counted when it first arrived.

## ESI data status

Per character, [`CharacterEsiStatus`](../../../frontend/src/Components/Accounts/CharacterEsiStatus.jsx)
draws the character-scoped rows of the collection table, and per corporation,
[`CorporationEsiSection`](../../../frontend/src/Components/Accounts/CorporationEsiSection.jsx) draws
one card per corporation any linked character belongs to. Both list
[`EsiStatusList`](../../../frontend/src/Components/Accounts/EsiStatusList.jsx), naming each
collection, its state and its age, and both sit behind a `Disclosure` (see
[components/figures.md](../components/figures.md)) that mounts its contents only while open — a list
that has never been opened costs nothing.

What each state means, and how a corporation-scoped collection differs from a character-scoped one,
is answered once, by the function this display reads →
[esi-collections/prefetch.md](../esi-collections/prefetch.md) § Collection status. The list carries
its own limitation in the section itself, because nothing yet records when a collection was last
fetched outside the current browsing session: ages cover this session only, and a collection fetched
before it reads as not held.

Ages come forward on a one-minute clock rather than on a cache subscription, so a list is a reading
of the cache as it stood when it was opened, refreshed once a minute while it stays open.
