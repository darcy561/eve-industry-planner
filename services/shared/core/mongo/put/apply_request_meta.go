package mongoput

import "eve-industry-planner/shared/shared/models"

// ApplyMetaSessionClient stamps _meta.sessionID and _meta.clientID from handler inputs.
// Session should come from auth context / cookie (auth.ExtractSessionID); clientID from X-WS-Client-ID.
func ApplyMetaSessionClient(meta *models.MetaData, sessionID, wsClientID string) {
	if meta == nil {
		return
	}
	if sessionID != "" {
		meta.SessionID = sessionID
	}
	if wsClientID != "" {
		meta.ClientID = wsClientID
	}
}
