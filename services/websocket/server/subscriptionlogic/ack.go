package subscriptionlogic

import "eve-industry-planner/shared/jsoncodec"

// MarshalSubscribeAck builds the subscribe_ack wire payload.
func MarshalSubscribeAck(docIDs []string) ([]byte, error) {
	return jsoncodec.Marshal(map[string]any{
		"type":   "subscribe_ack",
		"docIDs": docIDs,
	})
}
