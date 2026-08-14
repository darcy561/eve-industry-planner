package mongo

import "eve-industry-planner/shared/models"

// ApplyMetaSessionClient stamps _meta.sessionID and _meta.clientID from request inputs.
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
