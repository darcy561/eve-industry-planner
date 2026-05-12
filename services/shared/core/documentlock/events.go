package documentlock

// Document-lock event-type constants (values on the wire).
//
// These strings are part of the wire contract with the frontend — every
// publish site embeds one of them as the `event` field (see LockPayloadEventKey),
// and the browser CustomEvent dispatch in `useDocumentLock.js` branches on the
// same strings (also aliased as `type` on the detail object for compatibility).
//
// Keep in sync with `frontend/src/Functions/DocumentLock/documentLockEvents.js`.
const (
	// LockEventAcquired is published when the lock is freshly granted to a session
	// (first /acquire, or /request auto-grant on an empty lock).
	LockEventAcquired = "document_lock_acquired"

	// LockEventReleased is published when a holder voluntarily releases the lock,
	// or when the server-side cascade evicts a per-job lock after the parent group
	// lock rotates (cf. `LockReleaseReasonGroupHandoffCascade`).
	LockEventReleased = "document_lock_released"

	// LockEventRequested is published when another session enters the waitlist
	// for a lock currently held by someone else, so the holder can surface the
	// access-request snackbar.
	LockEventRequested = "document_lock_requested"

	// LockEventExpired is published when the lease TTL fires and no alive
	// waitlist head was available for promotion (cf. `LockExpiryReasonTTL`).
	LockEventExpired = "document_lock_expired"

	// LockEventHandoffProbe is published when /extend selects a queued waitlist
	// head as the next holder; the targeted session reacts by POSTing
	// /claim-handoff.
	LockEventHandoffProbe = "document_lock_handoff_probe"

	// LockEventHandoffCompleted is published when ownership transfers atomically:
	// claim-handoff success, /hand-over success, or expiry-driven waitlist
	// promotion (cf. `LockHandoffReason*`).
	LockEventHandoffCompleted = "document_lock_handoff_completed"
)

// LockHandoffReason* tag the `reason` field on `LockEventHandoffCompleted`.
const (
	// LockHandoffReasonHolderHandover marks transfers driven by the holder
	// pressing the "Hand over editing" snackbar action (see handleHandOver).
	LockHandoffReasonHolderHandover = "holder_handover"

	// LockHandoffReasonTTLPromotion tags `document_lock_handoff_completed` events
	// that originate from the expiry subscriber promoting the waitlist head when
	// the lease TTL fires — distinguishes them from interactive claim-handoff.
	LockHandoffReasonTTLPromotion = "ttl_promotion"
)

// LockExpiryReasonTTL tags TTL-driven `document_lock_expired` events.
const LockExpiryReasonTTL = "ttl"

// LockReleaseReason* tag the `reason` field on `LockEventReleased`.
const (
	// LockReleaseReasonGroupHandoffCascade tags `document_lock_released` events produced by
	// the group handoff cascade so clients can distinguish them from voluntary releases.
	LockReleaseReasonGroupHandoffCascade = "group_handoff_cascade"

	// LockReleaseReasonHandOverNoQueue marks the fallback release path inside
	// /hand-over when the requester is no longer alive (waitlist empty after
	// pulse pruning). Distinct from a normal voluntary release because the
	// holder intent was a handover.
	LockReleaseReasonHandOverNoQueue = "hand_over_no_queue"
)

// LockViewerEventJoined / LockViewerEventLeft tag the published presence events so
// clients can distinguish them from other `document_lock_*` notifications.
const (
	LockViewerEventJoined = "document_lock_viewer_joined"
	LockViewerEventLeft   = "document_lock_viewer_left"
)

// LockPayloadEventKey is the JSON field name for the document-lock domain
// discriminator on JetStream messages and on WebSocket fan-out (distinct from
// the outer WebSocket frame `type` channel tag, which is always "document_lock").
// Frontend equivalent: DOCUMENT_LOCK_DOMAIN_EVENT_KEY.
const LockPayloadEventKey = "event"

// HandoffCompletedOpts captures the optional fields for the
// `document_lock_handoff_completed` payload.
type HandoffCompletedOpts struct {
	PreviousHolderSessionID string
	Reason                  string
}

// BuildHandoffCompletedPayload assembles the `document_lock_handoff_completed`
// payload that gets published on a successful ownership transfer.
func BuildHandoffCompletedPayload(
	collection, docID, newHolderSessionID string,
	expiresAtUnix int64,
	opts HandoffCompletedOpts,
) map[string]any {
	payload := map[string]any{
		LockPayloadEventKey: LockEventHandoffCompleted,
		"collection":        collection,
		"docID":         docID,
		"sessionID":     newHolderSessionID,
		"expiresAtUnix": expiresAtUnix,
	}
	if opts.PreviousHolderSessionID != "" {
		payload["previousHolderSessionID"] = opts.PreviousHolderSessionID
	}
	if opts.Reason != "" {
		payload["reason"] = opts.Reason
	}
	return payload
}
