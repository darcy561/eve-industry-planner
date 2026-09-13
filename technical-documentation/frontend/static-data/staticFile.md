# How an owner holds its file (`frontend/src/Functions/Static/staticFile.js`)

Live SoT for the shape every synchronous static-data owner is built from:
[`frontend/src/Functions/Static/staticFile.js`](../../../frontend/src/Functions/Static/staticFile.js).

Which file each owner reads, and what it takes from it, belongs to that owner's own topic —
[items.md](./items.md), [reprocessing.md](./reprocessing.md), [recipes.md](./recipes.md). This one
covers what they share.

## Why an owner holds a file at all

Each file is downloaded and cached once and read many times, by callers that often cannot await: a
shopping list priced from a class method, a fit parsed from clipboard text, a job built from a click.
So loading is separated from reading — the file is primed once by whatever can wait, and every read
after that is a plain lookup that reports absence rather than blocking.

The owners differ only in which file they read and what they take from it. `staticFile(load, receive)`
is the rest: `prime`, `read`, `view` and `reset`.

## What is kept, and when it is dropped

`receive` decides what is kept from what was loaded, so a file arrives in the shape its readers want
rather than being reshaped on every read — a flat array keyed into a map, say. `read` answers `null`
until that has happened, which is how a caller tells "has not arrived" from "carries nothing": a
lookup against an empty map answers nothing for every id, and reads as the file disagreeing with what
was asked of it.

**A failure is never remembered as an answer.** The in-flight promise is cleared whether the load
settled or threw, so a later caller retries rather than inheriting one outage. Callers priming
together share that one load.

## A view is registered, not held beside the file

A value derived from a file — a filtered set, a name-keyed map — is built on first use and kept until
the file is dropped. `view` exists so that the keeping is the file's business rather than the caller's:

```js
const selectable = reprocessing.view((items) => /* … */);
```

The alternative an owner reaches for naturally is a module variable beside the contents, memoised with
`??=` and cleared by hand in its own reset. That works until someone adds a second derived value, or a
third, and one of the resets is forgotten — leaving a derived array alive against contents that have
been replaced by a new build. Registering the view with the file makes that impossible: `reset` drops
every view along with the contents, and no owner has to remember.

Nothing drops views when a file is *primed*, because it cannot need to — `prime` returns early unless
the contents are empty, and the only way back to empty is `reset`, which has already dropped them.

## Matching what a player pasted

`byName` and `nameKey` are the shared pair for looking an entry up by its name. `byName` keys entries
by their lowercased name; `nameKey` turns what a player typed into the same form, trimmed and
lowercased, so a caller matches the way the map was keyed.

They exist because a pasted list is matched a line at a time: a scan per line is a scan of the whole
file per line, which is what the ore, mineral and fit parsers each did separately before. A caller
whose entries carry their name under another key passes a reader for it.

## Which owners are built from it

[items.md](./items.md), [reprocessing.md](./reprocessing.md) and [recipes.md](./recipes.md) — and
`Functions/MarketData/marketGroupData.js`, which holds the market group tree this way while reading an
item's group from the item list rather than holding a second copy.
