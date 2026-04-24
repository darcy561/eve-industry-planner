package outgoinglogic

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
	for _, id := range ids {
		if id == want {
			return true
		}
	}
	return false
}

func ShouldSuppressRecipient(sourceSessionID, sourceClientID, recipientSessionID, recipientClientID string) bool {
	if sourceSessionID != "" {
		return recipientSessionID == sourceSessionID
	}
	if sourceClientID != "" {
		return recipientClientID == sourceClientID
	}
	return false
}

func asString(v interface{}) string {
	s, _ := v.(string)
	return s
}
