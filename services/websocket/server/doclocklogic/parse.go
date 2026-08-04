package doclocklogic

import (
	"encoding/json"
	"strings"
)

type presenceIncoming struct {
	Collection string `json:"collection"`
	DocID      string `json:"docID"`
}

type lockStateBatchIncoming struct {
	RequestID   string   `json:"requestId"`
	JobDocIDs   []string `json:"jobDocIDs"`
	GroupDocIDs []string `json:"groupDocIDs"`
}

// ParsePresence extracts collection + docID from a waitlist/viewer WS frame.
func ParsePresence(msg []byte) (collection, docID string, ok bool) {
	var in presenceIncoming
	if err := json.Unmarshal(msg, &in); err != nil {
		return "", "", false
	}
	c := strings.TrimSpace(in.Collection)
	d := strings.TrimSpace(in.DocID)
	if c == "" || d == "" {
		return "", "", false
	}
	return c, d, true
}

// LockStateBatchRequest is a parsed lock-state-batch WS frame.
type LockStateBatchRequest struct {
	RequestID   string
	JobDocIDs   []string
	GroupDocIDs []string
}

// ParseLockStateBatch parses a lock-state-batch WS frame.
// ok is false when JSON is invalid or requestId is missing.
func ParseLockStateBatch(msg []byte) (req LockStateBatchRequest, ok bool, parseErr error) {
	var in lockStateBatchIncoming
	if err := json.Unmarshal(msg, &in); err != nil {
		return LockStateBatchRequest{}, false, err
	}
	reqID := strings.TrimSpace(in.RequestID)
	if reqID == "" {
		return LockStateBatchRequest{}, false, nil
	}
	return LockStateBatchRequest{
		RequestID:   reqID,
		JobDocIDs:   in.JobDocIDs,
		GroupDocIDs: in.GroupDocIDs,
	}, true, nil
}
