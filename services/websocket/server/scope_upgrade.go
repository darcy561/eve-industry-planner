package server

import (
	"encoding/json"

	"eve-industry-planner/websocket/server/model"
)

// ApplyRealtimeScopeUpgrade validates requested corporation/alliance ids against the session grant
// ceiling stored on the client, merges them into Client.Scopes, and updates reverse indexes.
// Returns false when nothing was added (all requests invalid or empty).
func (s *Server) ApplyRealtimeScopeUpgrade(client *Client, corps, alliances []string) bool {
	if client == nil {
		return false
	}
	validC := filterToAllowed(client.grantedCorpIDs, corps)
	validA := filterToAllowed(client.grantedAllianceIDs, alliances)
	if len(validC) == 0 && len(validA) == 0 {
		return false
	}
	mergedCorps := unionDedupe(client.Scopes.CorporationIDs, validC)
	mergedAlliances := unionDedupe(client.Scopes.AllianceIDs, validA)
	next := model.RealtimeScopes{
		CorporationIDs: mergedCorps,
		AllianceIDs:    mergedAlliances,
	}
	s.swapClientOrgScopesAndIndexes(client, next)
	return true
}

// queueScopesAck notifies the client which realtime pools are active after upgrade or resume.
func (s *Server) queueScopesAck(client *Client) bool {
	if client == nil || client.Send == nil {
		return false
	}
	sub := map[string]any{
		"account":     true,
		"corporation": len(client.Scopes.CorporationIDs) > 0,
		"alliance":    len(client.Scopes.AllianceIDs) > 0,
	}
	b, err := json.Marshal(map[string]any{
		"type":         "scopes_ack",
		"ok":           true,
		"subscription": sub,
	})
	if err != nil {
		return false
	}
	select {
	case client.Send <- b:
		return true
	default:
		return false
	}
}
