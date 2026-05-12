package documentlocks

// Document-lock event-type constants.
//
// These strings are part of the wire contract with the frontend — every
// `publishLockEvent` site embeds one of them as the `type` field, and the
// browser CustomEvent dispatch in `useDocumentLock.js` branches on the same
// strings.
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
)

// LockReleaseReason* tag the `reason` field on `LockEventReleased`.
const (
	// LockReleaseReasonHandOverNoQueue marks the fallback release path inside
	// /hand-over when the requester is no longer alive (waitlist empty after
	// pulse pruning). Distinct from a normal voluntary release because the
	// holder intent was a handover.
	LockReleaseReasonHandOverNoQueue = "hand_over_no_queue"
)

// HandoffCompletedOpts captures the optional fields for the
// `document_lock_handoff_completed` payload. Both fields are emitted only when
// non-empty so the wire shape across the three publish sites
// (claim-handoff / hand-over / TTL promotion) stays exactly as the frontend
// already tolerates.
type HandoffCompletedOpts struct {
	// PreviousHolderSessionID is the session that lost the lock. Known by the
	// interactive paths (claim-handoff and hand-over) but unset by the expiry
	// subscriber (the previous holder's record has already been evicted by
	// Redis before this code runs).
	PreviousHolderSessionID string
	// Reason tags the cause of the transfer. Empty by default; the holder
	// hand-over path sets `LockHandoffReasonHolderHandover` and the expiry
	// subscriber sets `LockHandoffReasonTTLPromotion`. Claim-handoff omits it
	// because the cause is implied by the endpoint.
	Reason string
}

// buildHandoffCompletedPayload assembles the `document_lock_handoff_completed`
// payload that gets published on a successful ownership transfer. Centralising
// the shape here means the three call sites (claim-handoff, hand-over, TTL
// promotion) share one schema while keeping their existing wire shapes:
// optional fields are emitted only when their counterpart in `opts` is set.
func buildHandoffCompletedPayload(
	collection, docID, newHolderSessionID string,
	expiresAtUnix int64,
	opts HandoffCompletedOpts,
) map[string]any {
	payload := map[string]any{
		"type":          LockEventHandoffCompleted,
		"collection":    collection,
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
