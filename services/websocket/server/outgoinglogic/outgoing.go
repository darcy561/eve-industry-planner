package outgoinglogic

import "slices"

type RouteInfo struct {
	AccountID       string
	CorporationID   string
	AllianceID      string
	SourceClientID  string
	SourceSessionID string
}

func ScopeContains(ids []string, want string) bool {
	if want == "" || len(ids) == 0 {
		return false
	}
	return slices.Contains(ids, want)
}

// ShouldSuppressRecipient implements realtime echo suppression for outbound NATS payloads.
// When sourceClientID is set (_meta.clientID / WebSocket tab id), only that connection is skipped so
// other tabs sharing the same session still receive the message. When client id is absent (legacy or
// non-browser writes), fall back to suppressing the entire session.
func ShouldSuppressRecipient(sourceSessionID, sourceClientID, recipientSessionID, recipientClientID string) bool {
	if sourceClientID != "" {
		return recipientClientID == sourceClientID
	}
	if sourceSessionID != "" {
		return recipientSessionID == sourceSessionID
	}
	return false
}

func asString(v any) string {
	s, _ := v.(string)
	return s
}
