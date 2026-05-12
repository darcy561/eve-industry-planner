package natslogic

import (
	"encoding/json"
	"fmt"
	"strings"

	"eve-industry-planner/shared/core/documentlock"
)

// wsDocumentLockChannel matches frontend DOCUMENT_LOCK_FRAME_TYPES.CHANNEL.
const wsDocumentLockChannel = "document_lock"

func innerLockEventName(inner map[string]any) string {
	if s, ok := inner[documentlock.LockPayloadEventKey].(string); ok {
		if t := strings.TrimSpace(s); t != "" {
			return t
		}
	}
	// Legacy JetStream bodies used "type" before LockPayloadEventKey.
	if s, ok := inner["type"].(string); ok {
		return strings.TrimSpace(s)
	}
	return ""
}

// BuildDocumentLockWire turns a JetStream doc.lock inner JSON object into one
// WebSocket JSON object:
//
//	{ "type": "document_lock", "event": "<document_lock_*…>", …fields from inner… }
//
// The domain discriminator is always `event` (see documentlock.LockPayloadEventKey).
// The outer `type` is only the realtime channel tag — there is no nested `payload`.
//
// suppressSessionID is set for fan-out echo suppression (see subscription.go).
func BuildDocumentLockWire(rawPayload []byte) (wire []byte, suppressSessionID string, err error) {
	var inner map[string]any
	if err := json.Unmarshal(rawPayload, &inner); err != nil {
		return nil, "", err
	}

	eventName := innerLockEventName(inner)
	if eventName == "" {
		return nil, "", fmt.Errorf("document lock wire: missing event discriminator")
	}

	out := map[string]any{
		"type":  wsDocumentLockChannel,
		"event": eventName,
	}
	for k, v := range inner {
		if k == documentlock.LockPayloadEventKey || k == "type" {
			continue
		}
		out[k] = v
	}

	switch eventName {
	case documentlock.LockViewerEventJoined, documentlock.LockViewerEventLeft:
		if sid, ok := inner["sessionID"].(string); ok {
			suppressSessionID = strings.TrimSpace(sid)
		}
	case documentlock.LockEventRequested:
		if sid, ok := inner["requesterSessionID"].(string); ok {
			suppressSessionID = strings.TrimSpace(sid)
		}
	}

	wire, err = json.Marshal(out)
	if err != nil {
		return nil, "", err
	}
	return wire, suppressSessionID, nil
}
