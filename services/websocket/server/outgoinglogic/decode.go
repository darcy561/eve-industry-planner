package outgoinglogic

import (
	"encoding/json"
	"eve-industry-planner/shared/jsoncodec"
	"fmt"
	"strings"

	"eve-industry-planner/shared/crypto/entityid"
	"eve-industry-planner/shared/models"
)

// DecodedOutbound is the result of parsing a single NATS doc.update JSON payload.
type DecodedOutbound struct {
	Route      RouteInfo
	Collection string
}

// DecodeOutboundMessage unmarshals the payload once for routing.
func DecodeOutboundMessage(messageData []byte) (DecodedOutbound, error) {
	var msgData map[string]any
	if err := jsoncodec.Unmarshal(messageData, &msgData); err != nil {
		return DecodedOutbound{}, err
	}
	return DecodedOutbound{
		Route: RouteInfo{
			Owner:           ownerFromKey(msgData["ownerKey"]),
			SourceClientID:  asString(msgData["sourceClientID"]),
			SourceSessionID: asString(msgData["sourceSessionID"]),
		},
		Collection: asString(msgData["collection"]),
	}, nil
}

// ownerFromKey parses the message's owner key, yielding the zero owner when it is
// absent or unreadable.
func ownerFromKey(v any) models.Owner {
	key := strings.TrimSpace(stringFromScalar(v))
	if key == "" {
		return models.Owner{}
	}
	owner, err := models.ParseOwnerKey(key)
	if err != nil {
		return models.Owner{}
	}
	return owner
}

func stringFromScalar(v any) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	case float64:
		return fmt.Sprintf("%.0f", t)
	case json.Number:
		return t.String()
	case int:
		return fmt.Sprintf("%d", t)
	case int32:
		return fmt.Sprintf("%d", t)
	case int64:
		return fmt.Sprintf("%d", t)
	default:
		return fmt.Sprint(t)
	}
}

// routingOnlyFields are the message keys this service routes on, stripped before
// a payload reaches a browser.
var routingOnlyFields = []string{
	"ownerKey",
	"sourceClientID",
	"sourceSessionID",
}

// ClientPayload shapes a message for a browser: routing metadata removed, the
// owner named as a handle, the delivery's position added and every ref restored.
func ClientPayload(messageData []byte, owner models.Owner, cipher *entityid.Cipher, position uint64) []byte {
	var m map[string]any
	if err := jsoncodec.Unmarshal(messageData, &m); err != nil {
		return messageData
	}

	changed := false
	for _, k := range routingOnlyFields {
		if _, ok := m[k]; ok {
			delete(m, k)
			changed = true
		}
	}
	if !owner.IsZero() {
		if handle, err := models.OwnerHandle(owner, cipher); err == nil {
			m["owner"] = handle
			changed = true
		}
	}
	if position > 0 {
		m["position"] = position
		changed = true
	}
	if restoreEntityIDs(m, cipher) {
		changed = true
	}
	if !changed {
		return messageData
	}

	out, err := jsoncodec.Marshal(m)
	if err != nil {
		return messageData
	}
	return out
}

// restoreEntityIDs replaces every ref in a decoded message with its id, reporting
// whether anything changed and dropping a ref it cannot decrypt.
func restoreEntityIDs(node any, cipher *entityid.Cipher) bool {
	changed := false

	switch n := node.(type) {
	case map[string]any:
		for key, value := range n {
			if restoreEntityIDs(value, cipher) {
				changed = true
			}

			idKey, isRef := models.EntityRefIDKey(key)
			if !isRef {
				continue
			}
			ref, ok := value.(string)
			if !ok || ref == "" {
				continue
			}
			if !entityid.ValidShape(ref) {
				continue
			}

			delete(n, key)
			changed = true
			if cipher == nil {
				continue
			}
			if _, id, err := cipher.Decrypt(ref); err == nil {
				n[idKey] = id
			}
		}
	case []any:
		for _, value := range n {
			if restoreEntityIDs(value, cipher) {
				changed = true
			}
		}
	}

	return changed
}
