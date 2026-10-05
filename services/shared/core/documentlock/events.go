package documentlock

// Document-lock event names as they travel on the wire, matched by
// `frontend/src/Functions/DocumentLock/documentLockEvents.js`.
const (
	// LockEventAcquired is published when a session is freshly granted a lock.
	LockEventAcquired = "document_lock_acquired"

	// LockEventReleased is published when a holder gives a lock up, or hand-over finds no live
	// requester to give it to.
	LockEventReleased = "document_lock_released"

	// LockEventRequested is published when a session joins the waitlist for a lock somebody holds.
	LockEventRequested = "document_lock_requested"

	// LockEventExpired is published when a lease runs out with no live waitlist head to promote.
	LockEventExpired = "document_lock_expired"

	// LockEventHandoffProbe is published when /extend picks the waitlist head to take over next.
	LockEventHandoffProbe = "document_lock_handoff_probe"

	// LockEventHandoffCompleted is published when ownership moves from one session to another.
	LockEventHandoffCompleted = "document_lock_handoff_completed"
)

// LockHandoffReason* tag the `reason` on `LockEventHandoffCompleted`.
const (
	// LockHandoffReasonHolderHandover marks a transfer the holder chose to make.
	LockHandoffReasonHolderHandover = "holder_handover"

	// LockHandoffReasonTTLPromotion marks the waitlist head promoted when a lease ran out.
	LockHandoffReasonTTLPromotion = "ttl_promotion"
)

// LockExpiryReasonTTL tags an expiry the lease's own timeout caused.
const LockExpiryReasonTTL = "ttl"

// LockReleaseReason* tag the `reason` on `LockEventReleased`.
const (
	// LockReleaseReasonHolderRelease marks a holder releasing the lock themselves.
	LockReleaseReasonHolderRelease = "holder_release"

	// LockReleaseReasonHandOverNoQueue marks a hand-over that found nobody left to hand to.
	LockReleaseReasonHandOverNoQueue = "hand_over_no_queue"

	// LockReleaseReasonForceReleasedSameAccount marks a tab taking a lock back from another tab of
	// the same account.
	LockReleaseReasonForceReleasedSameAccount = "force_released_same_account"
)

// LockViewerEventJoined and LockViewerEventLeft tag a session starting and stopping viewing a
// document.
const (
	LockViewerEventJoined = "document_lock_viewer_joined"
	LockViewerEventLeft   = "document_lock_viewer_left"
)

// LockSourceSessionKey carries the session behind a viewer event to the websocket service, which
// routes on it and strips it before a browser sees it.
const LockSourceSessionKey = "sourceSessionID"

// LockPayloadEventKey is the field a lock event's name travels in, beside the websocket frame's own
// `type`.
const LockPayloadEventKey = "event"

// HandoffCompletedOpts carries the optional fields of a handoff-completed payload.
type HandoffCompletedOpts struct {
	PreviousHolderSessionID string
	Reason                  string
}

// BuildHandoffCompletedPayload builds the event published when ownership moves.
func BuildHandoffCompletedPayload(
	collection, docID, newHolderSessionID string,
	expiresAtUnix int64,
	opts HandoffCompletedOpts,
) map[string]any {
	payload := map[string]any{
		LockPayloadEventKey: LockEventHandoffCompleted,
		"collection":        collection,
		"docID":             docID,
		"participantID":     ParticipantID(newHolderSessionID),
		"expiresAtUnix":     expiresAtUnix,
	}
	if opts.PreviousHolderSessionID != "" {
		payload["previousHolderParticipantID"] = ParticipantID(opts.PreviousHolderSessionID)
	}
	if opts.Reason != "" {
		payload["reason"] = opts.Reason
	}
	return payload
}
