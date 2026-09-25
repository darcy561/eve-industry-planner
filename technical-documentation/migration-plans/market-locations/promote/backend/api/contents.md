# Backend — api

## Owns (SoT)

`services/api` HTTP surface and closely owned contracts: planner sessions, ESI session notes,
document-lock REST, the market prices query endpoint, handler dependency wiring, how a request body
is decoded and a response body is encoded, and the market locations an account or a planner may save
and price against.

## Does not own

- SPA auth/lock UI → [frontend/auth](../../frontend/auth/spa.md), [frontend/document-lock](../../frontend/document-lock/spa.md)
- Websocket fan-out / JetStream consumers → [websocket/](../websocket/contents.md) and stack websocket ops
- The JSON codec policy this package's request/response helpers are built on → [shared/jsoncodec.md](../shared/jsoncodec.md)
- Shared Mongo package behaviour → [shared/mongo.md](../shared/mongo.md)
- How a saved market's orders are fetched, derived, held and rotated once registered for pricing →
  `api/marketsources`, reached from [market-locations.md](./market-locations.md) § Topic-only detail
- How a region's orders are walked and a station's prices derived from them → [worker/market-orders.md](../worker/market-orders.md)
- How the SPA fetches, caches and holds a price once answered → [frontend/market-data/contents.md](../../frontend/market-data/contents.md)
- Migration history → [migration-plans/](../../migration-plans/contents.md)

## Task map

| I need to… | Read |
|------------|------|
| Wire Mongo/Redis/NATS into v1 handlers (`apideps`) | [deps.md](./deps.md) |
| Learn auth vocabulary / wire contract / end-to-end flows | [auth/overview.md](./auth/overview.md) |
| Change Redis sessions, middleware, refresh, upgrade auth | [auth/sessions.md](./auth/sessions.md) |
| Learn document-lock system overview | [document-lock/overview.md](./document-lock/overview.md) |
| Change lock HTTP/Redis/cascade | [document-lock/locks.md](./document-lock/locks.md) |
| Plan multi-tenant / lock backlog | [document-lock/roadmap.md](./document-lock/roadmap.md) |
| Read, restore or archive jobs | [archive.md](./archive.md) |
| Change the statistics views or their owner gate | [archive.md](./archive.md) § The owner in the path |
| Understand restore's order, or an ESI conflict | [archive.md](./archive.md) § End-to-end flows |
| Session + ESI notes (narrow) | [session-esi.md](./session-esi.md) |
| Decode a request body, or read what a 400 body tells the caller | [json.md](./json.md) § Decoding a request |
| Encode a response body, with or without choosing the status | [json.md](./json.md) § Encoding a response |
| Change what a market price query asks for or answers, or what it refuses | [market-prices.md](./market-prices.md) |
| Change a saved market's stored shape, how the set an account may price against is composed, or its validation limits | [market-locations.md](./market-locations.md) |
| Change the release steps that gave every settings document a market lane, or moved a saved market onto it | [market-locations.md](./market-locations.md) § A document that predates the lane |
