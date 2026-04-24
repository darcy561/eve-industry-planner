package natslogic

import "encoding/json"

func BuildDocumentLockWire(rawPayload []byte) ([]byte, error) {
	var payloadObj interface{}
	if err := json.Unmarshal(rawPayload, &payloadObj); err != nil {
		return nil, err
	}

	return json.Marshal(map[string]interface{}{
		"type":    "document_lock",
		"payload": payloadObj,
	})
}
