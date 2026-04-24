package outgoinglogic

import (
	"encoding/json"
	"fmt"
	"strings"
)

// DownwardScopes narrows delivery under an alliance or corporation root (message metadata).
// Empty lists mean "no extra filter" on that dimension (full fan-out under the root).
type DownwardScopes struct {
	CorporationIDs []string
	AccountIDs     []string
}

// DecodedOutbound is the result of parsing a single NATS doc.update JSON payload.
type DecodedOutbound struct {
	Route      RouteInfo
	Scopes     DownwardScopes
	Collection string
}

// DecodeOutboundMessage unmarshals the payload once for routing and scope filtering.
func DecodeOutboundMessage(messageData []byte) (DecodedOutbound, error) {
	var msgData map[string]interface{}
	if err := json.Unmarshal(messageData, &msgData); err != nil {
		return DecodedOutbound{}, err
	}
	return DecodedOutbound{
		Route: RouteInfo{
			AccountID:       strings.TrimSpace(stringFromScalar(msgData["accountID"])),
			CorporationID:   stringFieldOrNumber(msgData, "corporationID", "corporationId"),
			AllianceID:      stringFieldOrNumber(msgData, "allianceID", "allianceId"),
			SourceClientID:  asString(msgData["sourceClientID"]),
			SourceSessionID: asString(msgData["sourceSessionID"]),
		},
		Scopes:     parseScopes(msgData["scopes"]),
		Collection: asString(msgData["collection"]),
	}, nil
}

func stringFieldOrNumber(m map[string]interface{}, keys ...string) string {
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

// DecodeRouteInfo parses routing fields only (backwards compatible; prefer DecodeOutboundMessage on hot paths).
func DecodeRouteInfo(messageData []byte) (RouteInfo, error) {
	d, err := DecodeOutboundMessage(messageData)
	if err != nil {
		return RouteInfo{}, err
	}
	return d.Route, nil
}

func parseScopes(v interface{}) DownwardScopes {
	m, ok := v.(map[string]interface{})
	if !ok || m == nil {
		return DownwardScopes{}
	}
	return DownwardScopes{
		CorporationIDs: stringSliceFromJSONField(m, "corporationIDs"),
		AccountIDs:     stringSliceFromJSONField(m, "accountIDs"),
	}
}

func stringSliceFromJSONField(m map[string]interface{}, key string) []string {
	raw, ok := m[key]
	if !ok {
		return nil
	}
	arr, ok := raw.([]interface{})
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

func stringFromScalar(v interface{}) string {
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
	hasCorpFilter := len(scopes.CorporationIDs) > 0
	hasAcctFilter := len(scopes.AccountIDs) > 0
	if !hasCorpFilter && !hasAcctFilter {
		return true
	}
	corpHit := false
	if hasCorpFilter {
		for _, want := range scopes.CorporationIDs {
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
