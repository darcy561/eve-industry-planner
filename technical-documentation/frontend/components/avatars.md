# Avatar and image atoms (`Styled Components/Avatar`, `Functions/Shared/eveImage.js`)

Live SoT for how the SPA asks EVE's image server for a picture, and what it shows when there is not
one.

## The module

`Functions/Shared/eveImage.js` is the only file in the SPA that names `images.evetech.net`. It
exports three functions, one per category the server carries:

```js
typeImageUrl(typeID, variation, pixels)    // variation defaults to TYPE_IMAGE.ICON
characterImageUrl(characterID, pixels)     // the portrait
corporationImageUrl(corporationID, pixels) // the logo
```

`TYPE_IMAGE` is the vocabulary, exported beside them: `ICON`, `BLUEPRINT`, `BLUEPRINT_COPY` and
`RELIC`, frozen. A type is the only category with a choice to make, so it is the only one with a
constant — a character has a portrait and a corporation has a logo, and the module asks for those
itself.

`pixels` is how large the picture will be drawn, not a size the server serves — the server answers
anything outside its published set (32, 64, 128, 256, 512, 1024) with a 400 and no image. The module
rounds up into that set internally, so a 45-pixel avatar asks for 64 and a caller cannot reach the
400. **An absent id answers `undefined`**, so a call site guards nothing rather than building an
empty URL.

`EVE_DEFAULT_OWNER_ID` (`1`) is the id EVE serves its own default portrait and logo under. It has no
equivalent for an item — `types/1/icon` is a 404.

## `EveImageAvatar`

`EveImageAvatar`
([`Styled Components/Avatar/EveImageAvatar.jsx`](../../../frontend/src/Styled%20Components/Avatar/EveImageAvatar.jsx))
is a MUI `Avatar` and nothing else: it resolves a URL from the subject it is given, sizes the
avatar, and hands both to `Avatar`.

```jsx
<EveImageAvatar type={row.typeID} size={22} variant="rounded" />
<EveImageAvatar character={characterId} size={112} />
<EveImageAvatar src={assetImageUrl(node, itemRecords)} size={24} variant="square" />
```

`variant` is MUI's own vocabulary and defaults to MUI's own `circular`. `src` is for a URL something
else already resolved — the asset and owner helpers below reach it this way.

**The request is made at twice the drawn size**, so a high-density screen has pixels to use. A
responsive `size` (an sx breakpoint object) is fetched at the largest breakpoint it is ever drawn at.

**Which subject prop was passed decides the request, not what it holds**: `character={undefined}`
is still a character, and an id the app has not got yet is exactly when the default is wanted. A
character or corporation with no id is asked for under `EVE_DEFAULT_OWNER_ID`, so an account still
loading shows EVE's own placeholder rather than an empty frame. An item with no id is asked for not
at all, because the server has no default under an item category.

A picture the server has no art for is `Avatar`'s own answer: it renders its `children` when the
image fails to load, and where a caller gives it none, the first letter of `alt` or a person glyph.
A caller that wants something specific in that case passes a child, as `MarketGroupIcon` does.

## `OwnerAvatar` and `MarketGroupIcon`

Both are built on `EveImageAvatar` rather than on `Avatar` directly.

`OwnerAvatar` passes a resolved `src`, because an owner's id is a corporation id or a character hash
and only `ownerImageUrl` can tell which and resolve it (see
[row-collections.md](../esi-collections/row-collections.md) § Owner vocabulary).

`MarketGroupIcon` names its subject with `type`. It borrows the picture of one of the market group's
own items, because a group's own icon names a file inside the game client that nothing can serve.
Where a whole branch is obsolete and holds no published item to borrow, it passes a `CategoryIcon`
child through `EveImageAvatar`'s spread, so a group with nothing to show draws a glyph rather than
the person outline `Avatar` would otherwise fall back to.

## Where a screen composes `EveImageAvatar` directly

A screen already composing the app-shell surfaces reaches for `EveImageAvatar` itself rather than a
bare `<img>` or `Avatar`: the accounts cards, the asset tree and its dialogue templates, the
blueprint library card, the Planning stage's output and materials panels, the group-template dialogue,
and the item tree. A screen still on the SPA's older layout keeps its own markup and asks the module
for its URL directly — the module is the one thing every image call site shares, whichever markup
draws it.

## Two MUI compositions worth knowing

Both `Chip` and `AvatarGroup` style a child they recognise as an `Avatar`, with a rule aimed at that
child from the parent's own class — two classes, which outranks anything the child says in `sx`:

- **`Chip` clamps its avatar to 24 pixels, or 18 on a small chip.** Whatever `size` an `EveImageAvatar`
  is given there, the chip's own rule wins, so a caller inside a `Chip` has to name what the chip
  actually draws rather than what was asked for.
- **`AvatarGroup` rings each child.** Only an inline `style` beats the group's ring rule — an `sx`
  override loses the contest silently and the ring still appears. A stack that wants no ring has to
  suppress it with an inline `style`.

A third composition has no answer at all: a `<source>` inside a `<picture>` selects between sources
only for an `<img>` that is its **direct** child, so no component can sit there. A panel that needs
a smaller image below a breakpoint reaches for a responsive `size` on `EveImageAvatar` instead.
