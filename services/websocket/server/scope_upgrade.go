package server

import (
	"context"
	"encoding/json"
	"strconv"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/protectedfields"
	"eve-industry-planner/websocket/server/model"
)

// refsForRequestedIDs converts organisation ids supplied by a client into refs.
// Unparseable or non-positive ids are dropped: a client cannot widen its own scope
// by sending malformed input, and the grant ceiling is checked separately.
func (s *Server) refsForRequestedIDs(kind protectedfields.Kind, ids []string) []string {
	if len(ids) == 0 {
		return nil
	}
	if s == nil || s.entityCipher == nil {
		logs.WarnCtx(context.Background(), "websocket scope upgrade: entity ref helper unavailable, dropping request",
			"kind", string(kind), "requested", len(ids))
		return nil
	}

	numeric := make([]int, 0, len(ids))
	for _, raw := range ids {
		id, err := strconv.Atoi(raw)
		if err != nil || id <= 0 {
			continue
		}
		numeric = append(numeric, id)
	}

	refs, err := protectedfields.ValuesForIDs(s.entityCipher, kind, numeric)
	if err != nil {
		logs.WarnCtx(context.Background(), "websocket scope upgrade: failed to derive refs",
			"kind", string(kind), "error", err.Error())
		return nil
	}

	out := make([]string, 0, len(refs))
	for _, id := range numeric {
		if r, ok := refs[id]; ok {
			out = append(out, r)
		}
	}
	return out
}

// ApplyRealtimeScopeUpgrade validates the corporation and alliance ids a client
// asks for against the session grant ceiling, merges them into Client.Scopes, and
// updates reverse indexes. Returns false when nothing was added.
//
// The ids arrive from the browser and are converted here, because grants, scopes
// and indexes are all expressed as refs. An id that cannot be converted is dropped
// rather than compared raw, which would silently match nothing.
func (s *Server) ApplyRealtimeScopeUpgrade(client *Client, corpIDs, allianceIDs []string) bool {
	if client == nil {
		return false
	}
	corps := s.refsForRequestedIDs(protectedfields.KindCorp, corpIDs)
	alliances := s.refsForRequestedIDs(protectedfields.KindAlliance, allianceIDs)

	validC := filterToAllowed(client.grantedCorpRefs, corps)
	validA := filterToAllowed(client.grantedAllianceRefs, alliances)
	if len(validC) == 0 && len(validA) == 0 {
		return false
	}
	mergedCorps := unionDedupe(client.Scopes.CorporationRefs, validC)
	mergedAlliances := unionDedupe(client.Scopes.AllianceRefs, validA)
	next := model.RealtimeScopes{
		CorporationRefs: mergedCorps,
		AllianceRefs:    mergedAlliances,
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
		"corporation": len(client.Scopes.CorporationRefs) > 0,
		"alliance":    len(client.Scopes.AllianceRefs) > 0,
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
