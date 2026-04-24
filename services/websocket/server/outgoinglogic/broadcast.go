package outgoinglogic

// ScopeBroadcastRecipientDeliverable returns true for corporation/alliance scoped fan-out.
func ScopeBroadcastRecipientDeliverable(
	scopeIDs []string, scopeWant string,
	clientSessionID, clientID string,
	sourceSessionID, sourceClientID string,
	syncInProgress bool,
) bool {
	if !ScopeContains(scopeIDs, scopeWant) {
		return false
	}
	if ShouldSuppressRecipient(sourceSessionID, sourceClientID, clientSessionID, clientID) {
		return false
	}
	if syncInProgress {
		return false
	}
	return true
}

// ExplicitDocRecipientDeliverable returns true for explicit per-doc subscribers.
func ExplicitDocRecipientDeliverable(
	docID string,
	clientSessionID, clientID string,
	sourceSessionID, sourceClientID string,
	hasExplicitDoc bool,
	syncInProgress bool,
) bool {
	if ShouldSuppressRecipient(sourceSessionID, sourceClientID, clientSessionID, clientID) {
		return false
	}
	if docID == "" || !hasExplicitDoc {
		return false
	}
	if syncInProgress {
		return false
	}
	return true
}

// RawAccountRecipientDeliverable is used for pre-marshaled fan-out (e.g. doc.lock) where
// there is no source echo suppression — only account alignment is checked.
func RawAccountRecipientDeliverable(expectedAccountID, clientAccountID string) bool {
	return expectedAccountID != "" && clientAccountID == expectedAccountID
}

// TrySendNonBlocking attempts one non-blocking send; returns whether the message was queued.
func TrySendNonBlocking(send chan<- []byte, data []byte) bool {
	if send == nil || len(data) == 0 {
		return false
	}
	select {
	case send <- data:
		return true
	default:
		return false
	}
}
