package doclocklogic

import (
	"eve-industry-planner/shared/jsoncodec"
	"strings"
)

type presenceIncoming struct {
	Collection string `json:"collection"`
	DocID      string `json:"docID"`
	Owner      string `json:"owner"`
}

type lockStateBatchIncoming struct {
	RequestID   string   `json:"requestId"`
	JobDocIDs   []string `json:"jobDocIDs"`
	GroupDocIDs []string `json:"groupDocIDs"`
	Owner       string   `json:"owner"`
}

// PresenceFrame is a parsed waitlist/viewer WS frame.
//
// Owner is the planner the operation is for, as the handle a client knows. Every
// lock frame names it: the connection's own record of which planner it is in is
// set by a separate message, so a frame that arrived first would otherwise be
// scoped to whatever that record happened to hold.
type PresenceFrame struct {
	Collection string
	DocID      string
	Owner      string
}

// ParsePresence extracts a waitlist/viewer WS frame.
func ParsePresence(msg []byte) (PresenceFrame, bool) {
	var in presenceIncoming
	if err := jsoncodec.Unmarshal(msg, &in); err != nil {
		return PresenceFrame{}, false
	}
	f := PresenceFrame{
		Collection: strings.TrimSpace(in.Collection),
		DocID:      strings.TrimSpace(in.DocID),
		Owner:      strings.TrimSpace(in.Owner),
	}
	if f.Collection == "" || f.DocID == "" {
		return PresenceFrame{}, false
	}
	return f, true
}

// LockStateBatchRequest is a parsed lock-state-batch WS frame.
type LockStateBatchRequest struct {
	RequestID   string
	JobDocIDs   []string
	GroupDocIDs []string
	Owner       string
}

// ParseLockStateBatch parses a lock-state-batch WS frame.
// ok is false when JSON is invalid or requestId is missing.
func ParseLockStateBatch(msg []byte) (req LockStateBatchRequest, ok bool, parseErr error) {
	var in lockStateBatchIncoming
	if err := jsoncodec.Unmarshal(msg, &in); err != nil {
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
		Owner:       strings.TrimSpace(in.Owner),
	}, true, nil
}
