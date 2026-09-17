# JSON over HTTP (`services/api/helper`)

Live SoT for how the API decodes request bodies and encodes response bodies. Package:
[`services/api/helper`](../../../services/api/helper) — `json.go`. The codec policy underneath both
directions → [shared/jsoncodec.md](../shared/jsoncodec.md).

## Decoding a request

`DecodeJSONRequest(r, target, maxBodySize)` reads the body, enforces the size limit, and decodes
through [`jsoncodec.UnmarshalRequest`](../shared/jsoncodec.md) — the strict half of the package: it
refuses a member `target` does not declare, and answers a trailing-data error rather than a syntax
error for a body carrying more than the one value asked for. `maxBodySize <= 0` falls back to
`DefaultMaxBodySize`, 1MB.

A failure comes back as a `*JSONRequestError`, whose `Detail` is safe to put in the 400 body —
`DecodeJSONOrBadRequest` does exactly that, along with `Field`, `Offset` and `BodyPreview` where they
apply:

| `Detail` | Meaning | Carries |
|----------|---------|---------|
| `empty_body` | no bytes at all | — |
| `body_too_large` | over the size limit | a preview of the truncated body |
| `extra_data` | the body holds more than the one JSON value asked for | a preview |
| `syntax_error` | malformed JSON | the byte offset |
| `type_mismatch` | a value's JSON kind does not match the target field's Go type | the field path and byte offset |
| `unknown_field` | a member the target does not declare | the field path |
| `read_error` | reading the body itself failed | — |
| `decode_error` | a fallback for a decode failure of no other kind. Nothing currently reaches it: every way a body can fail arrives as one of the two above, including a target's own `UnmarshalJSON` refusing a value, which surfaces as a `type_mismatch` naming the field | a preview |

`Field` is a dotted path read from the decode error's own JSON pointer — `rows.0.count` for an array
index — walked token by token so a name escaping `/` or `~` comes back unescaped rather than
misread. `Detail` is decided by the error's type, not by parsing its message.

## Encoding a response

`EncodeJSON(w, data)` sets `Content-Type: application/json` and writes the body through
[`jsoncodec.Encode`](../shared/jsoncodec.md), leaving the status to the caller — most handlers have
already chosen one, or net/http sends 200 for the rest.

`EncodeJSONStatus(w, status, data)` is for a caller that wants both. It sets the content type **before**
calling `WriteHeader`, because `WriteHeader` sends the header map as it stands — delegating to
`EncodeJSON` after the status would lose the content type silently, with a response that still carries
a body and still looks right in a browser.

`BuildJSONPayloadAndWeakETag` encodes through `jsoncodec` and returns that payload, but the ETag is not
a hash of it: the payload is decoded back and re-serialised in a canonical form — map keys sorted,
strings quoted by `strconv.Quote` — and the hash is taken over that. The two differ by more than
whitespace, because the wire payload escapes `<`, `>` and `&` and the canonical form does not. What
this buys is an ETag that tracks the value rather than its rendering, so a change in how the payload is
written does not invalidate every cached copy, while a change in what it says does.

## Topic-only detail

- `websocket/server` and `shared/plannersession/request` call `jsoncodec` directly rather than through
  this package: one service never imports another's packages, and neither needs the status variant
  `EncodeJSONStatus` adds.
- This file holds both the request and response halves of the JSON surface; there is no separate
  `compression.go`.
