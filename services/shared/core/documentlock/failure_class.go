package documentlock

// Failure-class strings shared by HTTP document-locks and WebSocket adapters.
// Keep wire/log classification identical across surfaces.
const (
	FailureUnavailable          = "doc_lock_unavailable"
	FailureBadRequest           = "doc_lock_bad_request"
	FailureStateFailed          = "doc_lock_state_failed"
	FailureStateBatchBadRequest = "doc_lock_state_batch_bad_request"
	FailureStateBatchEmpty      = "doc_lock_state_batch_empty"
	FailureStateBatchTooMany    = "doc_lock_state_batch_too_many"
	FailureStateBatchFailed     = "doc_lock_state_batch_failed"
	FailureWaitlistPulseFailed  = "doc_lock_waitlist_pulse_failed"
	FailureWSInvalidMessage     = "doc_lock_ws_invalid_message"
)
