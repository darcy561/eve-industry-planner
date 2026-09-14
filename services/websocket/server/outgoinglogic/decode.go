package outgoinglogic

import (
	"encoding/json"
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
	if err := json.Unmarshal(messageData, &msgData); err != nil {
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
//
// Parsed rather than split: an org kind whose id is not a ref would mean a raw EVE
// id reached routing. A zero owner delivers to explicit subscribers only, so an
// unreadable key under-delivers rather than fanning out to a scope.
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

// routingOnlyFields are the message keys this service routes on. They name
// internal identities — refs and source ids — and are stripped before a payload
// reaches a browser, which has no use for them and should not learn them.
var routingOnlyFields = []string{
	// Replaced by `owner`, the same owner as a handle rather than a key.
	"ownerKey",
	"sourceClientID",
	"sourceSessionID",
}

// ClientPayload returns messageData shaped for a browser: routing metadata
// removed, the owner named as the handle a client can read, and every entity ref
// in the document body converted back to the raw id the client is owed.
//
// This runs after routing has been decided, and only on the copy handed to
// delivery. Routing matches on refs, so converting any earlier would leave a
// message that matches nothing.
//
// It returns the original bytes unchanged when nothing needs rewriting, which is
// now only a message with no owner to name: naming the owner re-encodes every
// other, which the client needs to tell one planner's documents from another's.
func ClientPayload(messageData []byte, owner models.Owner, cipher *entityid.Cipher) []byte {
	var m map[string]any
	if err := json.Unmarshal(messageData, &m); err != nil {
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
	if restoreEntityIDs(m, cipher) {
		changed = true
	}
	if !changed {
		return messageData
	}

	out, err := json.Marshal(m)
	if err != nil {
		return messageData
	}
	return out
}

// idKeyFor maps a ref-bearing key to the id key that replaces it, reporting
// whether the key names a ref at all.
//
// Both spellings exist because a ref is spelled to match the id field it stands
// in for, and those differ by area: job bodies mirror ESI (corporation_id), while
// _meta is ours (accountID). The key produced here is what the client reads, so
// it has to match the model's json tag, not the storage convention.
func idKeyFor(key string) (string, bool) {
	if base, ok := strings.CutSuffix(key, "_ref"); ok && base != "" {
		return base + "_id", true
	}
	if base, ok := strings.CutSuffix(key, "Ref"); ok && base != "" {
		return base + "ID", true
	}
	return "", false
}

// restoreEntityIDs walks a decoded message and replaces every ref with its id,
// reporting whether anything changed.
//
// A value that looks like a ref but does not decrypt is dropped rather than
// passed through, so a ref cannot reach a browser because a key was missing or
// the value was malformed.
func restoreEntityIDs(node any, cipher *entityid.Cipher) bool {
	changed := false

	switch n := node.(type) {
	case map[string]any:
		for key, value := range n {
			if restoreEntityIDs(value, cipher) {
				changed = true
			}

			idKey, isRef := idKeyFor(key)
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
