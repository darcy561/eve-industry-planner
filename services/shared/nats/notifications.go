package nats

import (
	"encoding/json"
	"fmt"
	"strings"
)

// PublishNotification tells the people working in an owner that something
// happened.
//
// Unacknowledged and not retried. A notification is worthless replayed later —
// "your figures were updated" three hours after the fact is worse than silence —
// and nothing is lost by dropping one, because every state it announces is also
// readable on the next request. It saves a client from waiting for that request,
// which is all it should be trusted to do.
//
// The envelope is built here and nowhere else, so a producer names a subtype and
// a body rather than assembling the frame a browser reads.
func PublishNotification(n *NATS, ownerKey, subtype string, body any) error {
	subtype = strings.TrimSpace(subtype)
	if subtype == "" {
		return fmt.Errorf("a notification needs a subtype")
	}
	data, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshal %s notification: %w", subtype, err)
	}
	frame, err := json.Marshal(Message{
		Type:    ClientMessageNotification,
		Subtype: subtype,
		Data:    data,
	})
	if err != nil {
		return fmt.Errorf("marshal notification envelope: %w", err)
	}
	return PublishToAudience(n, Subscribers(ownerKey), subtype, frame)
}
