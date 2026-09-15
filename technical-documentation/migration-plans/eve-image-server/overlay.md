# EVE image server — overlay

What changed and how it works after each stage.

Live behaviour is [frontend/](../../frontend/contents.md) until this project promotes.

## Stage A — The module

`frontend/src/Functions/Shared/eveImage.js` is the only file in the SPA that names
`images.evetech.net`. It exports three functions, one per category the server carries:

```js
typeImageUrl(typeID, variation, pixels)    // variation defaults to TYPE_IMAGE.ICON
characterImageUrl(characterID, pixels)     // the portrait
corporationImageUrl(corporationID, pixels) // the logo
```

**`TYPE_IMAGE` is the vocabulary**, exported beside them: `ICON`, `BLUEPRINT`, `BLUEPRINT_COPY` and
`RELIC`, frozen, the same shape `OWNER_KIND` has. A type is the only category with a choice to make,
so it is the only one with a constant — a character has a portrait and a corporation has a logo, and
the module asks for those itself.

Nothing outside the module types a variation. That includes the three places that *decide* one:
`findBlueprintType` answers `TYPE_IMAGE.BLUEPRINT` or `TYPE_IMAGE.BLUEPRINT_COPY` rather than the bare
strings, and the blueprint card and the manufacturing layout pick theirs from the constant.

`LIBRARY_FILTER` in `Functions/Blueprints/filterLibraryBlueprints.js` is **not** this vocabulary,
though one member spells the same. It is a URL filter value, and its `BPO` against the image server's
`bp` is the proof: the two coincide on a string, they do not share a fact.

**`pixels` is how large the picture will be drawn, not a size the server serves.** The module rounds
up into the served set, so a 45-pixel avatar asks for 64 and a caller cannot reach the 400-and-no-image
answer an unpublished size gets. The rounding helper is private to the module: nothing outside it has
a reason to know the set.

**An absent id answers `undefined`**, so a call site guards nothing. That is what removed the `src=""`
fallbacks: the four Selling panels and the Building tab's linked-jobs badge each built an empty string
where a character or corporation record was missing, and a browser resolves `src=""` against the page's
own URL and requests the page. They now pass the id through optional chaining and get no URL at all.

Two existing helpers became callers rather than second answers. `ownerImageUrl` in
`Functions/Shared/eveOwner.js` still resolves a CharacterHash to a CharacterID against the account
store and still picks portrait or logo from the owner's kind, but the URL comes from here.
`assetImageUrl` in `Functions/Assets/assetPresentation.js` still decides whether a node wants `relic`
or `icon` and asks for that variation. Neither forwards to a moved helper — `eveImageSize` no longer
exists outside this module.

### What the sweep changed at the call sites

Fifty-odd inline template literals across 44 files became calls. Every URL that already named a size
kept it exactly: 32, 64, 128 and 256 all round to themselves.

Fourteen URLs named **no** size and took the server's original — a full-resolution portrait behind a
24-pixel avatar. Each now names the size it is drawn at, doubled so a high-density screen has pixels
to use, which is the convention `OwnerAvatar` and `MarketGroupIcon` already followed. (The survey
counted fifteen; it was taken at the commit the project opened and one site has gone since.)

The malformed URL in `Components/Dashboard/.../AddItemDialogue/mainDisplay.jsx` — a trailing space
inside the template literal — went with the conversion.

`Functions/Shared/eveImage.test.js` covers the size contract, the URL shape per category, and the
absent-id answer.

## Stage B — The image component

**In progress.** A first attempt swept all 59 call sites at once and
was reverted: every round of rework on the component then landed on all 59 again, and a scripted diff
that size is too large for anyone to read closely enough to catch a dropped `key`. This one started with the screens already on the app-shell design and has widened from
there, an area at a time: **31 of the 59 sites are converted.**

`EveImageAvatar` in `frontend/src/Styled Components/Avatar/EveImageAvatar.jsx` takes the subject and
how large it is drawn:

```jsx
<EveImageAvatar type={row.typeID} size={22} variant="rounded" />
<EveImageAvatar character={characterId} size={112} />
<EveImageAvatar src={assetImageUrl(node, itemRecords)} size={24} variant="square" />
```

It is a MUI `Avatar` and nothing else: it resolves a URL, sizes the avatar, and hands both over.
`variant` is MUI's own vocabulary and defaults to MUI's own `circular`. `src` is for a URL something
else resolved — `assetImageUrl` decides whether a node is a relic, `ownerImageUrl` resolves a
CharacterHash against the account store.

**The request is made at twice the drawn size.** That doubling used to be applied by hand at some
sites and forgotten at others. A responsive `size` is fetched at the largest breakpoint it is ever
drawn at.

**A character or corporation with no id is asked for under id `1`**, which is what EVE serves its own
default portrait and logo under, so an account still loading shows EVE's placeholder rather than an
empty frame. The server has no equivalent for an item — `types/1/icon` and `types/0/icon` are both
404 — so an item with no id is asked for not at all.

Which subject prop was *passed* decides that, not what it holds: `character={undefined}` is still a
character, and an id the app has not got yet is exactly when the default is wanted.

### Where it is used

| Area | Files | Was |
|------|-------|-----|
| Accounts | `MainCharacterCard`, `AccountEntry` ×2 | `Avatar` |
| Assets | `assetTreeRow` | `Avatar` |
| Assets dialogue | `assetTemplate` ×2, `containerTemplate` | `Avatar` |
| Blueprint Library | `blueprintCard` | `Box component="img"` |
| Planning / Returns | `outputHeader` | `Box component="img"` |
| Planning / Materials | `materialCards`, `materialsTable` | `Box component="img"` |
| Group templates | `ApplyGroupTemplateDialogue` | `Avatar` |
| Item tree | `ItemTree` | `Avatar` in a `Chip` slot |
| Dialogues | `importFittingItemRow`, `itemRow`, `shoppingListItem` | `Avatar` |
| Groups | `ClassicGroupJobCardFrame`, `itemFrame`, `OutputCard` | `Avatar` |
| Reprocessing | `MineralCard` ×2, `advancedMineralOutput`, `basicMineralOutput` | `Avatar` |
| `Chip` avatar slots | `AddNewJobPanel`, `blueprintSettingsFrame`, `searchbar`, `Linked Job Badge` | `Avatar` |
| `AvatarGroup` runs | `AccountData`, `ClassicGroupJobCard` | `Avatar` |

The four that were plain images gain `Avatar`'s wrapper, `overflow: hidden` and `object-fit: cover`.
None of that shows: every source is a square icon in a square box, and each names the shape it already
drew — `square` where it had no corner radius, `rounded` where it had one, with the two material lists
keeping their 3px through `sx` because `rounded` is the theme's 4px.

`assetTemplate`'s two avatars named no size at all and were taking `Avatar`'s default 40 pixels by
accident. They now say 40, so the 24 next to them in `containerTemplate` reads as a choice.

### The two shared image components are callers now

`OwnerAvatar` and `MarketGroupIcon` are built on it rather than on `Avatar` directly, which is what
carries it onto every screen those two already appear on. `MarketGroupIcon` keeps its `CategoryIcon`
child — an obsolete market group has no item to borrow a picture from, and a glyph is the deliberate
answer there — and the child reaches `Avatar` through the spread.

### The two compositions that needed care

Both work, because the component is a real `Avatar` and forwards what its parent clones onto it. Both
also size the avatar themselves, with a rule aimed at the child from the parent's own class — two
classes, which outranks anything the child says in `sx`. That is the trap in this pair:

- **`Chip` clamps its avatar to 24 pixels, or 18 on a small chip.** Whatever `size` the component is
  given, the chip's own rule wins, so the four `Chip` slots name what the chip actually draws rather
  than what they used to ask the server for.
- **`AvatarGroup` rings each child**, and `ClassicGroupJobCard` has always drawn its stack without
  one. Only an inline `style` beats the group's rule; an `sx` override loses the specificity contest
  silently and the ring appears. The site's original inline style is kept for that reason, and
  `ClassicGroupJobCard.test.jsx` renders the card with two items and asserts the computed border,
  because nothing short of a rendered card sees this.

`AccountData` suppresses its ring through `sx`, which by the same rule does not take effect — it draws
the ring today and still does. Left as it is rather than changed under cover of this work.

### What is not converted yet

28 sites. One shape among them needs a decision rather than a conversion:

- **`<picture>` with a `<source>`** in the two blueprint layouts selects between sources only for an
  `<img>` that is its direct child, which no component can be. A responsive `size` does the same job,
  but the switch moves from the 700px the media query names to the theme's `sm`.

The rest are ordinary: seven bare `<img>` sites that have no sizing of their own and need to name the
shape they draw, and nineteen plain `Avatar`s across Edit Job's Building, Purchasing and Selling
panels, the classic job cards, the header, and the job tree.

## Stage C — The three defects

The trailing space and the `src=""` panels are closed — they went with Stage A's sweep, because a
module that answers `undefined` for an absent id leaves a call site nothing to fake. The third, that
no image in the SPA has an `onError`, is a property of the component and waits with Stage B.
