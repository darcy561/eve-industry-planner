package esi

import (
	"time"
)

// MessageInterface provides a common interface for JetStream messages.
// Handlers use this interface to work with jetstream.Msg messages.
type MessageInterface interface {
	Ack() error
	Nak() error
	Term() error
	InProgress() error
	NakWithDelay(delay time.Duration) error
	NumDelivered() uint64
	// GetData returns the raw message data if available, nil otherwise
	GetData() []byte
	// ParseData parses the JSON message data into the target struct
	// First tries to parse as TaskMessage (with task_type wrapper), then falls back to direct parsing
	ParseData(target interface{}) error
}
