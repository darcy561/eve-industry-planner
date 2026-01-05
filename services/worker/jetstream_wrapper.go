package main

import (
	"encoding/json"
	"fmt"
	"time"

	"eve-industry-planner/shared/tasks/esi"
	natscore "eve-industry-planner/shared/core/nats"

	"github.com/nats-io/nats.go/jetstream"
)

// jetstreamMessageWrapper wraps jetstream.Msg to implement MessageInterface for handlers
type jetstreamMessageWrapper struct {
	msg jetstream.Msg
}

func (w *jetstreamMessageWrapper) Ack() error {
	return w.msg.Ack()
}

func (w *jetstreamMessageWrapper) Nak() error {
	return w.msg.Nak()
}

func (w *jetstreamMessageWrapper) Term() error {
	return w.msg.Term()
}

func (w *jetstreamMessageWrapper) InProgress() error {
	return w.msg.InProgress()
}

func (w *jetstreamMessageWrapper) NakWithDelay(delay time.Duration) error {
	return w.msg.NakWithDelay(delay)
}

func (w *jetstreamMessageWrapper) NumDelivered() uint64 {
	md, err := w.msg.Metadata()
	if err != nil {
		return 1
	}
	return md.NumDelivered
}

func (w *jetstreamMessageWrapper) GetData() []byte {
	return w.msg.Data()
}

// ParseData parses the JSON message data into the target struct.
// First tries to parse as TaskMessage (with task_type wrapper), then falls back to direct parsing.
func (w *jetstreamMessageWrapper) ParseData(target interface{}) error {
	data := w.msg.Data()
	if len(data) == 0 {
		return nil // No data to parse
	}

	// Try to parse as TaskMessage first (with task_type wrapper)
	// This is the format when published via PublishTaskMessage
	var taskMsg natscore.TaskMessage
	if err := json.Unmarshal(data, &taskMsg); err == nil && taskMsg.Data != nil {
		// Successfully parsed as TaskMessage, now parse the inner Data field
		return json.Unmarshal(taskMsg.Data, target)
	}

	// Fallback: Try to parse directly as the target type (if sent as raw JSON)
	return json.Unmarshal(data, target)
}

// getMessageMetadata returns message metadata for logging purposes
func getMessageMetadata(msg jetstream.Msg) (uint64, string) {
	md, err := msg.Metadata()
	if err != nil {
		return 1, "unknown"
	}
	sequenceStr := fmt.Sprintf("%d/%d", md.Sequence.Stream, md.Sequence.Consumer)
	return md.NumDelivered, sequenceStr
}

// wrapJetStreamMsg wraps a jetstream.Msg to esi.MessageInterface
func wrapJetStreamMsg(msg jetstream.Msg) esi.MessageInterface {
	return &jetstreamMessageWrapper{msg: msg}
}
