package outgoinglogic

import (
	"encoding/json"
	"fmt"
	"strings"

	"eve-industry-planner/shared/crypto/entityid"
)

// DownwardScopes narrows delivery under an alliance or corporation root (message metadata).
// Empty lists mean "no extra filter" on that dimension (full fan-out under the root).
type DownwardScopes struct {
	CorporationRefs []string
	AccountIDs      []string
}

// DecodedOutbound is the result of parsing a single NATS doc.update JSON payload.
type DecodedOutbound struct {
	Route      RouteInfo
	Scopes     DownwardScopes
	Collection string
}

// DecodeOutboundMessage unmarshals the payload once for routing and scope filtering.
func DecodeOutboundMessage(messageData []byte) (DecodedOutbound, error) {
	var msgData map[string]any
	if err := json.Unmarshal(messageData, &msgData); err != nil {
		return DecodedOutbound{}, err
	}
	return DecodedOutbound{
		Route: RouteInfo{
			AccountID:       strings.TrimSpace(stringFromScalar(msgData["accountID"])),
			CorporationRef:  stringFieldOrNumber(msgData, "corporationRef"),
			AllianceRef:     stringFieldOrNumber(msgData, "allianceRef"),
			SourceClientID:  asString(msgData["sourceClientID"]),
			SourceSessionID: asString(msgData["sourceSessionID"]),
		},
		Scopes:     parseScopes(msgData["scopes"]),
		Collection: asString(msgData["collection"]),
	}, nil
}

func stringFieldOrNumber(m map[string]any, keys ...string) string {
	for _, k := range keys {
		v, ok := m[k]
		if !ok {
			continue
		}
		s := strings.TrimSpace(stringFromScalar(v))
		if s != "" {
			return s
		}
	}
	return ""
}

func parseScopes(v any) DownwardScopes {
	m, ok := v.(map[string]any)
	if !ok || m == nil {
		return DownwardScopes{}
	}
	return DownwardScopes{
		CorporationRefs: stringSliceFromJSONField(m, "corporationRefs"),
		AccountIDs:      stringSliceFromJSONField(m, "accountIDs"),
	}
}

func stringSliceFromJSONField(m map[string]any, key string) []string {
	raw, ok := m[key]
	if !ok {
		return nil
	}
	arr, ok := raw.([]any)
	if !ok || len(arr) == 0 {
		return nil
	}
	out := make([]string, 0, len(arr))
	for _, el := range arr {
		s := stringFromScalar(el)
		s = strings.TrimSpace(s)
		if s != "" {
			out = append(out, s)
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
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

// AllianceRecipientMatchesDownward returns whether a pooled alliance client should receive
// the message given alliance-level scopes (union semantics for corp vs account lists).
func AllianceRecipientMatchesDownward(
	clientCorpScope []string,
	clientAccountID string,
	scopes DownwardScopes,
) bool {
	hasCorpFilter := len(scopes.CorporationRefs) > 0
	hasAcctFilter := len(scopes.AccountIDs) > 0
	if !hasCorpFilter && !hasAcctFilter {
		return true
	}
	corpHit := false
	if hasCorpFilter {
		for _, want := range scopes.CorporationRefs {
			if ScopeContains(clientCorpScope, want) {
				corpHit = true
				break
			}
		}
	}
	acctHit := false
	if hasAcctFilter {
		for _, want := range scopes.AccountIDs {
			if want != "" && clientAccountID == want {
				acctHit = true
				break
			}
		}
	}
	if hasCorpFilter && hasAcctFilter {
		return corpHit || acctHit
	}
	if hasCorpFilter {
		return corpHit
	}
	return acctHit
}

// CorporationRecipientMatchesDownward returns whether a pooled corporation client should receive
// the message given corporation-level scopes (account id list).
func CorporationRecipientMatchesDownward(clientAccountID string, scopes DownwardScopes) bool {
	if len(scopes.AccountIDs) == 0 {
		return true
	}
	for _, want := range scopes.AccountIDs {
		if want != "" && clientAccountID == want {
			return true
		}
	}
	return false
}

// routingOnlyFields are the message keys this service routes on. They name
// internal identities — refs and source ids — and are stripped before a payload
// reaches a browser, which has no use for them and should not learn them.
var routingOnlyFields = []string{
	"corporationRef",
	"allianceRef",
	"scopes",
	"sourceClientID",
	"sourceSessionID",
}

// ClientPayload returns messageData shaped for a browser: routing metadata
// removed, and every entity ref in the document body converted back to the raw
// id the client is owed.
//
// This runs after routing has been decided, and only on the copy handed to
// delivery. Routing matches on refs, so converting any earlier would leave a
// message that matches nothing.
//
// It returns the original bytes unchanged when nothing needs rewriting, so the
// common account-scoped path allocates nothing.
func ClientPayload(messageData []byte, cipher *entityid.Cipher) []byte {
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
