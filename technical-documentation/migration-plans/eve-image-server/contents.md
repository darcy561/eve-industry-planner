# EVE image server

## Owns

How the SPA asks EVE's image server for a picture, and what it shows when there is not one.

- **The one place the hostname and the URL shape live.** Every `https://images.evetech.net/...`
  the SPA builds, and the category, variation and size it names.
- **Which sizes may be asked for.** The server answers anything outside its published set with a
  400 and no image, so a size is validated by construction rather than by the caller remembering.
- **What a missing picture looks like.** A record the app does not hold, an id the server has no art
  for, and a request that fails — three different absences the SPA currently renders three ways,
  none of them deliberate.
- **The vocabulary.** What a category, a variation and a size are called in code, so a call site
  reads as a request rather than as string assembly.

**Not live SoT** until this project is complete and promotion is approved.

Named for the **work**, not a git branch. **Project close** = plan tracks done + live-SoT **promote**
(go-ahead).

## Does not own

- **What each picture means.** Whether a blueprint row shows `bp` or `bpc`, whether an asset is an
  ancient relic, which character a portrait belongs to — those are the callers' questions, and this
  project carries their answers rather than deciding them.
- **Resolving an owner to an id.** `ownerImageUrl` turns a character hash into a CharacterID through
  the account store; that lookup belongs to the owner vocabulary, not to the image server.
- **Market group imagery.** Which item a market group borrows is decided by
  [market-pricing-defaults](../market-pricing-defaults/contents.md); this project owns only how that
  item becomes a URL.
- **Anything server-side.** No Go code asks the image server; the SPA is the only caller.

## Task map

| Topic | Where |
|-------|-------|
| Why this exists, the survey, and the stages | [plan.md](./plan.md) |
| What changed and how it works after each stage | [overlay.md](./overlay.md) |
| The call-site survey the plan is scoped from | [measurements/call-sites.md](./measurements/call-sites.md) |
