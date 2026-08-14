package subscriptionlogic

import "encoding/json"

// MarshalSubscribeAck builds the subscribe_ack wire payload.
func MarshalSubscribeAck(docIDs []string) ([]byte, error) {
	return json.Marshal(map[string]any{
		"type":   "subscribe_ack",
		"docIDs": docIDs,
	})
}
