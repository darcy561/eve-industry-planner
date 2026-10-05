package natslogic

import (
	"eve-industry-planner/shared/jsoncodec"
	"fmt"
	"strings"

	"eve-industry-planner/shared/core/documentlock"
	eipnats "eve-industry-planner/shared/nats"
)

func innerLockEventName(inner map[string]any) string {
	if s, ok := inner[documentlock.LockPayloadEventKey].(string); ok {
		return strings.TrimSpace(s)
	}
	return ""
}

// BuildDocumentLockWire turns a doc.lock event into the frame a browser receives, and names the
// session whose own tabs a viewer event is not echoed to.
func BuildDocumentLockWire(rawPayload []byte) (wire []byte, suppressSessionID string, err error) {
	var inner map[string]any
	if err := jsoncodec.Unmarshal(rawPayload, &inner); err != nil {
		return nil, "", err
	}

	eventName := innerLockEventName(inner)
	if eventName == "" {
		return nil, "", fmt.Errorf("document lock wire: missing event discriminator")
	}

	out := map[string]any{
		"type":  eipnats.ClientMessageDocumentLock,
		"event": eventName,
	}
	for k, v := range inner {
		if k == documentlock.LockPayloadEventKey || k == "type" || k == documentlock.LockSourceSessionKey {
			continue
		}
		out[k] = v
	}

	switch eventName {
	case documentlock.LockViewerEventJoined, documentlock.LockViewerEventLeft:
		if sid, ok := inner[documentlock.LockSourceSessionKey].(string); ok {
			suppressSessionID = strings.TrimSpace(sid)
		}
	}

	wire, err = jsoncodec.Marshal(out)
	if err != nil {
		return nil, "", err
	}
	return wire, suppressSessionID, nil
}
