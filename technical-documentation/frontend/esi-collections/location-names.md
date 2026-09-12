# Location names (`frontend/src/Hooks/EveEsi/useLocationNames.js`)

Live SoT for how an EVE id becomes the name a player reads: places from ESI's bulk lookup, player
structures from a linked character's token, and the community-submitted store as the fallback
beneath that — for both collections. Hook:
[`frontend/src/Hooks/EveEsi/useLocationNames.js`](../../../frontend/src/Hooks/EveEsi/useLocationNames.js).
Loader: [`frontend/src/Functions/EveESI/World/nameLoader.js`](../../../frontend/src/Functions/EveESI/World/nameLoader.js).

Which locations an asset or blueprint view needs named comes from
[assets.md](./assets.md) and [blueprints.md](./blueprints.md); this topic only covers turning an id
into a name.

## Asking for names

`useLocationNames(locationIds)` takes the ids a view wants named and returns the names it has,
alongside loading and error state and `failed` — the ids whose lookup did not settle. A failure is
never cached, so those ids have no entry among the names and nothing there tells them apart from an
id still being asked about; `failed` is how a surface that shows what it could not resolve tells the
two apart. Each id is its own cache entry —
[`nameQuery`](../../../frontend/src/Hooks/React%20Query/World/names.js), keyed
`["esi", "name", <id>]` — so a name resolved for one view is present for the next without being
asked for again, and an id that could not be resolved is a failure against that id rather than a
hole in one view's set. A consumer resolving names outside a render, inside a flow already running —
the broker fee a linked market order was charged, which is worked out where no component is
rendering — calls `fetchNames(queryClient, ids)` instead, which shares the same per-id cache: a name
either path resolves is present for the other. Only a player structure needs a character's token, so
that call takes characters only when it might ask for one.

## What a lookup can settle on

| Outcome | Meaning | Kept for the session | Retried |
|---|---|---|---|
| named | ESI named it — public, or a character could see it | yes | no |
| community | no character could see it; the community store had a name | yes | no |
| unnamed | ESI answered and had no name for this id | yes | no |
| no-access | every linked character was refused and the community store had nothing | yes | no |
| *(nothing — the lookup throws)* | the token could not be acquired, ESI was unwell, the request was refused for rate, or a character could not be asked at all | no | yes |

A refusal is answered for: the request went through and said "you cannot see this" (`403` or
`404`), and asking again says the same thing while the same characters are linked. It is kept like
any other settled outcome, so an account that links a character who can see the structure reads its
name from the next session rather than during this one. Anything
else — a `5xx`, a rate-limit refusal, a token that could not be refreshed — throws rather than
settling, so nothing upstream can cache it as an answer. A name lasts the app session and is not
carried across a reload: nothing persists it, which is what keeps a renamed structure, or one the
account has since lost access to, from being served stale.

## Where a name comes from

`nameSource(id)` (`Functions/EveESI/World/nameSource.js`) decides where to ask from the id's kind
(`resolveLocationKind`, `Functions/Assets/assetLocationConstants.js`):

- A region, constellation, system, abyssal system or station — and a faction, corporation, alliance
  or character id — is asked in bulk through `POST /universe/names`, one call per thousand ids
  raised in a tick.
- A structure (a spawned item's id) is asked of the account's linked characters in turn, through
  `GET /universe/structures/{id}` with each character's token.
- A celestial, a stargate, a station's office folder, and any id outside a documented range name
  nothing at all: `POST /universe/names` answers only for the place kinds above and refuses the
  whole call over anything else, so neither path is asked, and the id settles as `unnamed` without a
  request being made.

A ship in space is not asked either. Its item id sits in the same range a structure's does, so what
tells the two apart is what is filed inside it rather than the id: a holder outside the asset set is
settled as a ship, not a structure, when what it holds carries a fitting-slot, bay or cargo flag
(`assetLocationConstants.isShipHoldFlag`). `Functions/Assets/assetLocationIds.js`'s
`unnameableLocationIds` collects those ids, and the surfaces that walk the nodes themselves — the
tree, the "where is this held" dialogue, the blueprint library's locations — filter through it. The
location dropdown needs no filter: it takes its ids from `assetLocationIds`, which admits only the
place kinds, so a ship never reaches it. Either way an id that was never going to resolve is never
asked about.

## Asking every character for a structure

Docking access is per character, and nothing records which one holds it, so a structure is named by
asking each linked character in turn (`fetchStructureName`). One character's refusal decides nothing
for the account by itself — the next character is still asked — and only once every character has
been asked and refused does the community store come into it (`communityNameOrRefusal`), never
earlier: asking it sooner would take a community name over an alt's own docking rights. An account
that has opted out of sharing citadel names does not read them either, and settles on `no-access`
without asking.

A character whose token was never granted the structures scope is not counted as having been asked:
asking anyway would spend a refusal to be told what the token already says, and the answer would be
indistinguishable from a genuine docking refusal once it arrived. If every character was either
skipped this way or failed without a clean refusal, the id is a failure rather than settling as
`no-access` — the account has not established that it cannot see the structure.

## Batching without asking per id

`Functions/EveESI/World/nameLoader.js` keeps a cache entry per id from becoming a request per id.
Everything asked for in one tick is collected and flushed on the next macrotask — after React has
rendered the whole list of views wanting names — and issued as ESI takes it: the public ids as one
`POST /universe/names` per thousand, each structure as its own character walk. Two views wanting the
same id in the same tick share one lookup.

`POST /universe/names` is all-or-nothing: one id it cannot resolve refuses the whole call with a
`404` that names nothing and does not say which id was at fault. A batch refused this way is split
in half and asked again, down to the single id at fault, which settles as `unnamed`; every other id
in the batch still gets its name. A batch refused for any other reason is not split — those ids
failed rather than one of them being at fault, and a failure is retried whole rather than turned into
a cascade of smaller calls.

## What the rest of the app reads

A location nobody could name is shown saying so, never dropped — an office or a station missing from
a list reads as the place not existing, when the truth may be a genuine access problem. That
standard, and the order locations are shown in, belongs to [assets.md](./assets.md) §
Assembling a view (`describeLocation`, `byLocationOrder`, `locationOptions`); this topic produces the
names those functions read and stops there.

Every settled outcome reaches a consumer, including one ESI had no name for: an entry that carries
no name is still an answer, and withholding it left a surface unable to tell it from an id still
being asked about, so a place was asked for and nothing appeared. A consumer reads the name it holds
and falls back to the shared label when there is none.

`forgetNames` drops what is known about an id, so the next view asking resolves it again. Nothing
calls it: a settled outcome is right while the account is the same account, and a structure that
refused every linked character will refuse them again. It stops being right when what the account
can see changes — a character linked, a corporation or alliance joined or left — and that is what
this exists for, so whatever comes to watch for those changes has somewhere to say so rather than
reaching into the cache's keys from outside.

The query cache is the only place a resolved name lives. A settled outcome sits under
`["esi","name",<id>]` at `staleTime: Infinity` and `gcTime: Infinity`, so nothing else has to hold a
copy to stop an id being asked about twice — and a test seeding a name for a view seeds that entry,
through `tests/seedLocationNames.js`.

## Topic-only detail

`Functions/EveESI/World/communityNames.js` owns the community store in both directions, because
structure information has one home: `communityName` reads a name back, and `submitStructureName`
gives one. A character with docking access who names a structure through ESI, on an account that has
not opted out, queues that name to be submitted, batched up to 200 submissions per request and sent
on a short delay — or at once when the queue grows, or when the page is hidden, so a queue that only
ever drained on a timer does not lose what it holds when the page goes away. A chunk the store
refuses is put back rather than dropped.

`Functions/Endpoints/Private/citadelNames.js` is the client underneath: `readCommunityName` reads one
id per `GET`, ETag'd and CDN-cached at the edge, and `submitCommunityNames` posts a batch. What is
worth submitting and when it is sent are not its business.
