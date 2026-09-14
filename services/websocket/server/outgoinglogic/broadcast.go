package outgoinglogic

// ClientBelongsToAccount reports whether a client still works in the account a
// message addresses. An unnamed account matches nobody rather than everybody.
func ClientBelongsToAccount(expectedAccountID, clientAccountID string) bool {
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
