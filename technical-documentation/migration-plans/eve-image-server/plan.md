# EVE image server — plan

**Status:** Phase 1 only. No code work started.
**Code in scope:** [`frontend/src/`](../../../frontend/src/) — `Functions/Shared/eveOwner.js`,
`Functions/Assets/assetPresentation.js`, `Styled Components/Avatar/`, and the ~40 components listed
in [measurements/call-sites.md](./measurements/call-sites.md). No Go: nothing server-side asks the
image server.
**Live SoT (until promote):** [frontend/](../../frontend/contents.md)

**Rules:** Read and following [`../documentation-rules.md`](../documentation-rules.md)
and [`../technical-rules.md`](../technical-rules.md) (migration-plans).
Phase 1 (project folders/docs) before any product work.
No Go surfaces in scope, so no `go fix` scan applies.
Live SoT will not be edited until this project is complete and promotion is approved.

## Why this project exists

The SPA asks EVE's image server for a picture in **61 places across 44 files**, and builds the URL
inline at about fifty-five of them. The hostname, the category, the variation and the size are
retyped each time.

That is not only repetition. The server answers an unpublished size with **a 400 and no image**, and
the SPA already knows this — `Functions/Shared/eveOwner.js` holds `IMAGE_SIZES` with exactly that
comment. Four call sites go through it. The rest hardcode a number that happens to be right today,
and nothing would catch one that is not.

The survey also found three defects that only exist because nothing owns the shape: a URL with a
trailing space in it, four panels that set `src=""` and make the browser request the page's own URL,
and not one `onError` handler in the whole SPA.

## What a caller should be able to say

A call site should name what it wants and how big, and get back a URL or nothing:

```
imageUrl.type(typeID, "icon", 32)
imageUrl.character(characterID, 64)
imageUrl.corporation(corporationID, 32)
```

Rather than assembling a host, a path and a query by hand. The size is validated by construction, so
the 400 is unreachable; an absent id answers `undefined`, so a caller cannot accidentally ask for
nothing; and the one place that knows the contract is the one place that has to change when the
contract does.

## The three absences, which are not the same thing

The SPA currently renders these three ways, none of them chosen:

- **The app holds no record.** No character for this hash, no corporation for this id. Nothing should
  be requested; today four panels request the page's own URL instead.
- **The server has no art.** An id it does not know, or a variation that type does not have. The
  request is made and fails, and today about forty plain `<img>` sites show a broken image.
- **The picture is still arriving.** No component distinguishes this from failure.

`Avatar` covers the first two by rendering a child, which is why `OwnerAvatar` and `MarketGroupIcon`
degrade and the plain `<img>` sites do not. Whatever this project builds has to make that the default
rather than the accident of which component someone reached for.

## Stages

### Stage A — The module, and the helpers that already exist folded into it

One module owning the host, the categories, the variations and the size set. `eveImageSize` and
`ownerImageUrl` move into it or call it; `assetImageUrl` keeps deciding *which* variation an asset
wants and asks this for the URL.

**Done when** no file outside the module names `images.evetech.net`, except the module's own test.

### Stage B — One image component, with the absences handled

A component that takes what to show and how big, renders the picture, and shows something
deliberate when there is not one. The two `Avatar`-based components become callers of it rather than
two separate answers to the same question.

**Done when** no `<img>` in the SPA points at the image server directly, and a broken or absent
picture is the same experience wherever it happens.

### Stage C — The three defects

The trailing space, the four `src=""` panels, and a size on the fifteen URLs that name none. Each is
a one-line change once Stage A exists, and each is currently reachable.

**Done when** every request the SPA makes is one the server can answer.

## Non-goals

- **Deciding what a caller shows.** Which variation a blueprint row wants, whether an asset is an
  ancient relic, which character a portrait belongs to — the callers keep those.
- **Caching or preloading images.** The browser already does this, and nothing has asked for more.
- **The `tenant` parameter.** The server accepts `singularity`, and the SPA has never needed it. The
  module should not make it impossible, but nothing here builds for it.
- **Asking the server what art exists.** A variation-less URL returns JSON listing an id's
  variations. That would turn one image into two requests, and the absences above are cheaper to
  handle by rendering something sensible.

## Open decisions

- **What a missing picture should look like.** A glyph per category, one generic glyph, or the
  server's own id-`1` fallback — which returns a real EVE placeholder portrait or logo rather than
  an icon of ours. Undecided, and it is the question Stage B turns on.

## Stage status

| Stage | State |
|-------|-------|
| Phase 1 — project folder and docs | Done |
| Stage A — the module | Not started |
| Stage B — the image component | Not started; waits on § Open decisions |
| Stage C — the three defects | Not started; each is reachable today |

## Start here

Read [measurements/call-sites.md](./measurements/call-sites.md) first — the scope is an argument from
spread, and the numbers are what make the case.

**Stage C is separable and could go first.** The three defects are real today and each is a one-line
fix; they are grouped here because they share a cause, not because they need the module. If the
consolidation is deferred, fix them anyway.

This project was found while giving market group rows an icon, which is recorded at
[market-pricing-defaults/plan.md](../market-pricing-defaults/plan.md) § Stage B6. That work added
one more inline call site rather than the forty-first exception, and the survey that followed is
what opened this.
