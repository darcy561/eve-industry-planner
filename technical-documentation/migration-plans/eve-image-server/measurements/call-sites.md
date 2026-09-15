# Every image server call site, counted

Taken from `frontend/src` at the commit this project was opened. Recorded because the plan's
scope is an argument from spread, and a later reader should be able to check whether the spread
is still what it was.

| | |
|---|---|
| Occurrences of `images.evetech.net` | 61 |
| Files carrying one | 44 |
| Of those, test files | 2 |
| Distinct URL-building expressions | 21 |
| Built through a helper | 4 sites |
| Built inline as a template literal | ~55 sites |

## What is asked for

Categories used: `types`, `characters`, `corporations`. **`alliances` is never asked for**, though
the server serves it.

Variations used: `icon`, `bp`, `bpc`, `relic`, `portrait`, `logo`. **`render` is never asked for.**

Sizes passed as literals: 32, 64, 128, 256 — all valid. Sizes passed through `eveImageSize`: also
all valid, because that helper rounds up into the served set. **15 URLs name no size at all** and
take the server's original, which for a 24-pixel avatar is a full-resolution download.

## The three defects the survey found

**A malformed URL.** `Components/Dashboard/.../AddItemDialogue/mainDisplay.jsx` emits `?size=64 `
— a trailing space inside the template literal.

**`src=""` on four Selling panels.** `linkedMarketOrdersTab`, `availableOrdersTab`,
`linkedTransactionPanel` and `availableTransactionsPanel` each yield an empty string where a
character or corporation record is missing. A browser resolves `src=""` against the page's own URL
and requests it, so the fallback costs a request and still renders broken.

**No error handling anywhere.** There is not one `onError` on an image in the SPA. The two
`Avatar`-based components degrade because MUI renders a child when the image fails; the ~40 plain
`<img>` sites show a broken image.

## What this survey missed

It grepped for `images.evetech.net`, so it never saw the **seven files still asking
`https://image.eveonline.com/Type/<id>_32.png`** — the host EVE served images from before the current
one. They were found while converting, and the real spread was 59 places, not 52. A survey scoped to
one spelling of a thing finds one spelling of it.

## What the server offers that nothing uses

- **Id `1` is a documented fallback** for characters, corporations and alliances — a real answer
  for the `src=""` sites.
- **A `tenant` parameter**, defaulting to `tranquility` and also accepting `singularity`.
- **A variation-less URL** returns JSON listing what art exists for an id. Nothing asks, so nothing
  knows whether a picture exists before requesting it.

## Where the knowledge already sits

`Functions/Shared/eveOwner.js` holds `IMAGE_SIZES` with the comment: *"The only sizes EVE's image
server serves. Anything else is answered with a 400 and no image."* That is the contract, written
down once, and roughly fifty-five call sites do not go through it.
