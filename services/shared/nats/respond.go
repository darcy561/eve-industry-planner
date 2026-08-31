package nats

import (
	"encoding/json"
	"fmt"

	natslib "github.com/nats-io/nats.go"
)

// RespondJSON marshals v and sends it as a core-NATS reply (msg.Respond).
func respondJSON(msg *natslib.Msg, v any) error {
	if msg == nil {
		return fmt.Errorf("nats: RespondJSON nil msg")
	}
	data, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("nats: RespondJSON marshal: %w", err)
	}
	if err := msg.Respond(data); err != nil {
		return fmt.Errorf("nats: RespondJSON: %w", err)
	}
	return nil
}

// RespondEnvelope wraps payload in Message{Type, Data} and Responds.
func RespondEnvelope(msg *natslib.Msg, typ string, payload any) error {
	var data json.RawMessage
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return fmt.Errorf("nats: RespondEnvelope marshal payload: %w", err)
		}
		data = b
	}
	return respondJSON(msg, Message{Type: typ, Data: data})
}
