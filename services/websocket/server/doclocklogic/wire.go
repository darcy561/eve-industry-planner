package doclocklogic

// WebSocket message type strings for document-lock ingress/ack.
const (
	MsgWaitlistPulse     = "document_lock_waitlist_pulse"
	MsgViewerArrived     = "document_lock_viewer_arrived"
	MsgViewerDeparted    = "document_lock_viewer_departed"
	MsgLockStateBatch    = "document_lock_lock_state_batch"
	MsgLockStateBatchAck = "document_lock_lock_state_batch_ack"
)
