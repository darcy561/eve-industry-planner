# Overlay — how realtime delivery works while this project is in flight

Lay this on top of live [backend/websocket/websocket.md](../../backend/websocket/websocket.md), and
on [realtime-message-routing/overlay.md](../realtime-message-routing/overlay.md) where that project is
still in flight. Where this file is silent, those remain the truth. Sections appear here as stages
land, each saying **what changed** and **how that part works now**.

## Stage A — The shape and one adapter

**What changed.** Audience messages are no longer delivered by fan-out functions of their own. The
subscription is now an adapter: it converts what arrived into `Outbound` and hands it to one walk.

**The shape.** `Outbound` carries the family and kind, the audience and target, the source connection,
and the frame. The family selects a delivery policy and never the recipients — audience stays its own
field, because `subscribers` and `members` name the same target and differ only in which index is
read.

**The walk.** The audience picks the candidate set — every client, the owner pool, or an account's
connection index. Each candidate is then checked to still belong to that owner, skipped if it is the
connection the message came from, held back if the family's policy says so and the client is
rebuilding, and sent to otherwise. One outcome records a reason per client id.

**The subject carries the family.** `deliver.{audience}.{target}.{family}.{subtype}`. A table keyed by
family needs it, and reading it from the frame would mean opening a body this service forwards unread.

**Audience delivery reports what the other paths report.** It returned a bare recipient count, and
`broadcastRawToSubscribers` read one field off a full outcome and dropped the rest. Both are gone;
audience messages now fill the same `outboundDeliveryOutcome` documents and locks do, so an operator
asking who missed a message gets the same answer whichever path carried it.

**What an account still goes through.** `broadcastRawToAccount` has one caller left, the document
lock. The audience path reaches an account's tabs through the connection index directly, inside the
walk.

## Stage B — Documents

**What changed.** `deliverOutboundDocUpdate` is an adapter. It decodes the message, builds the frame,
and hands one `Outbound` to the same walk audience messages go through.
`broadcastToAccountClients`, `broadcastToOwnerScope` and `deliverToExplicitDocSubscribers` are gone.

**How a document is addressed.** The owner the message states chooses the audience. A readable owner —
account, corporation or alliance — addresses the connections working in it. A message stating none
addresses whoever asked for that document by name: a delete without a preimage, or a producer that
named no owner. The two are alternatives rather than one plus an extra, which is how they always
behaved; the by-name set was only ever reached when no owner was readable.

That by-name audience is internal. An adapter picks it, no producer can address it, and a message
arriving on the wire keeps only an audience a producer is allowed to name — so publishing its string
reaches nobody.

**The sync gate is now a family's policy rather than a property of a function.** A client rebuilding
its state is held back from a document change, because the baseline it is writing is half there and a
change applied on top of one lands in a document about to be replaced. It refetches what it missed
when the rebuild finishes. An announcement still reaches that client: it is one fact with nothing to
apply it on top of.

**What an operator sees differently.** `route_kind` names the audience that carried the message —
`subscribers`, or `doc_subscribers` — where it used to name `account`, `corporation`, `alliance` or
`explicit`. The owner kind it used to carry is now its own key, `owner_kind`, beside `owner_ref`. A
message nothing could carry sets `undeliverable` rather than writing a reason into `route_kind`.

**One accounting gap closed on the way.** The account path used to drop a client whose account no
longer matched with a warning and no skip record, so a delivery that refused a recipient reported the
same shape as one that never had it. Every refusal is recorded now.

**An owner kind with no id is reported rather than delivered emptily.** It addresses no pool, so it
sets `undeliverable` — as does a target the owner model cannot read at all. Both used to read as an
audience nobody was connected for, which is an ordinary outcome, and neither is.

## Stage C — Document locks

**What changed.** `subscribeToDocLockNotifications` hands the frame to `deliverDocumentLock`, which
builds one `Outbound` and gives it to the same walk documents and audience messages go through.
`broadcastRawToAccount` is gone, so every message a client receives now travels one path.

**How a lock is addressed.** The subject names an account; the adapter targets it as an owner and the
walk reaches its tabs through the connection index, which is what the deleted function did directly.

**Suppression is by session and only for viewer events.** A viewer joining or leaving is one fact
about a whole session, so the id the payload carries is the JWT session id every tab shares and all of
them are skipped. A lock *request* carries a session id too and is deliberately not suppressed: it is
the same shared id, so suppressing it would skip the tab that asked for the lock, and the SPA gates
its snackbar on the held ref instead.

**One finisher reports every family.** `finishReplicaFanoutOperation` now takes what is being
delivered rather than a finished sentence, and composes `… delivered`, `… delivered (idle replica)`,
`… delivered (suppressed on replica)`, `… delivered (no recipients on replica)` and `… rejected`
itself. The rejection branch used to be a separate document-only function; locks reach it now too.

**What an operator sees differently.**

| Key | Was | Is |
|-----|-----|----|
| `route_kind` on a lock | `doc_lock` | `subscribers`, with `owner_kind` `account` and `owner_ref` beside it |
| `subtype` | absent | narrows a family that has kinds — a notification says which notification |
| `family` | absent | names the traffic — `document`, `document_lock` — because two families now share an audience and `route_kind` alone no longer says what was delivered |
| `suppress_session_id` | the session being skipped | `source_session_id`, the same id under the name every path uses |
| a skipped tab | `skipped_session_suppression_client_ids` | `skipped_echo_suppression_client_ids`, the one key for both suppression tiers |
| a lock nothing could carry | delivered emptily and logged as an idle replica | `doc lock notification rejected` at warn, with `undeliverable` |
| a fan-out that reached nobody | `… (suppressed on replica)` whenever anything was skipped | `… (suppressed on replica)` only when every skip was deliberate — the source connection, or a client rebuilding its state; a client dropped for a full send buffer or a stale index reads `… (no recipients on replica)` |

**One accounting gap closed.** A client whose account no longer matched was dropped silently; it is
recorded as a scope skip now, the same as on the document path.

**`document_lock` is spelled once in Go.** The family constant moved beside the others in
`shared/nats`, so the frame the adapter builds and the row in the delivery table cannot drift apart.
Stage D then added it to `ClientMessageKinds`, with no kinds under it.

## Stage D — The vocabulary covers the wire

**What changed.** `document_lock` is in the shared vocabulary on both sides and in the corpus, and the
SPA no longer branches on a message type nothing sends.

**The corpus is the messages addressed to an audience.** Not every string that can appear in a
`type` field. `document_lock` was the one such family the corpus did not name, so it is the only one
added. The connection-lifecycle frames — `connected`, `resume_ack`, `subscribe_ack`,
`please_reconnect` — and the lock's `document_lock_lock_state_batch_ack` stay out: each is a reply or
a lifecycle signal written to the one connection it concerns, addressing nobody, so there is no
delivery decision for the corpus to guard.

That line is not the same as holding a row in `deliveryPolicies`. `maintenance` is addressed to every
connected client and is in the corpus, but keeps its own path because the socket close is the point
of it.

**The family carries no kinds.** A lock's kind travels in an `event` field of the frame rather than in
a subtype, so it joins as a family with an empty kind list, and the `event` values keep being matched
against `shared/core/documentlock` as they already were.

**The SPA reads the lock spelling rather than repeating it.** `MESSAGE_TYPE_DOCUMENT_LOCK` is
`DOCUMENT_LOCK_FRAME_TYPES.CHANNEL` from the document-lock module that already owns the string, so
the vocabulary cannot drift from the wire constant beside it.

**Three files move together.** The corpus, `ClientMessageKinds` and `MESSAGE_KINDS` are checked
against each other for exact set equality in both directions, so a family added to one alone turns
the other side's suite red. That guard already existed; this stage decided what belongs inside it.

**One dead branch is gone.** The SPA tested for `type === "app_version"` as though it were a message
family. No path sends it: it is a field inside the `connected` and `resume_ack` frames, which the SPA
reads correctly where those arrive. The branch and the two imports that served only it are removed.

**What is deliberately still standing.** The `sync` package and its frames are unreached at both ends
and are not removed here — see [plan.md](./plan.md) § The sync path belongs to shared planners. The
delivery table's `skipWhileSyncing` policy stays with them.
