package doclocklogic

import "encoding/json"

// MarshalLockStateBatchAck builds the lock-state-batch ack WS payload.
func MarshalLockStateBatchAck(requestID string, ok bool, jobResults, groupResults map[string]any, errMsg string) ([]byte, error) {
	payload := map[string]any{
		"type":      MsgLockStateBatchAck,
		"requestId": requestID,
		"ok":        ok,
	}
	if ok {
		payload["jobResults"] = jobResults
		payload["groupResults"] = groupResults
	} else if errMsg != "" {
		payload["error"] = errMsg
	}
	return json.Marshal(payload)
}
