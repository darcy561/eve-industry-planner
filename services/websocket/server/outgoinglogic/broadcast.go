package outgoinglogic

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
