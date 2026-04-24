package server

import (
	"strconv"
	"strings"

	"eve-industry-planner/websocket/server/model"
)

func stringSetFromSlice(ids []string) map[string]struct{} {
	out := make(map[string]struct{})
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id != "" {
			out[id] = struct{}{}
		}
	}
	return out
}

func int64SliceToStringIDs(ids []int64) []string {
	if len(ids) == 0 {
		return nil
	}
	out := make([]string, 0, len(ids))
	for _, v := range ids {
		out = append(out, strconv.FormatInt(v, 10))
	}
	return out
}

// Lock order when both corp and alliance indexes are touched: corpIndexMu before allianceIndexMu.

func (s *Server) registerCorpPoolsLocked(client *Client) {
	if client == nil || client.id == "" {
		return
	}
	for _, cid := range client.Scopes.CorporationIDs {
		cid = strings.TrimSpace(cid)
		if cid == "" {
			continue
		}
		if s.corpToClients[cid] == nil {
			s.corpToClients[cid] = make(map[string]bool)
		}
		s.corpToClients[cid][client.id] = true
	}
}

func (s *Server) registerAlliancePoolsLocked(client *Client) {
	if client == nil || client.id == "" {
		return
	}
	for _, aid := range client.Scopes.AllianceIDs {
		aid = strings.TrimSpace(aid)
		if aid == "" {
			continue
		}
		if s.allianceToClients[aid] == nil {
			s.allianceToClients[aid] = make(map[string]bool)
		}
		s.allianceToClients[aid][client.id] = true
	}
}

func (s *Server) unregisterCorpPoolsLocked(client *Client) {
	if client == nil || client.id == "" {
		return
	}
	for _, cid := range client.Scopes.CorporationIDs {
		cid = strings.TrimSpace(cid)
		if cid == "" {
			continue
		}
		if m := s.corpToClients[cid]; m != nil {
			delete(m, client.id)
			if len(m) == 0 {
				delete(s.corpToClients, cid)
			}
		}
	}
}

func (s *Server) unregisterAlliancePoolsLocked(client *Client) {
	if client == nil || client.id == "" {
		return
	}
	for _, aid := range client.Scopes.AllianceIDs {
		aid = strings.TrimSpace(aid)
		if aid == "" {
			continue
		}
		if m := s.allianceToClients[aid]; m != nil {
			delete(m, client.id)
			if len(m) == 0 {
				delete(s.allianceToClients, aid)
			}
		}
	}
}

// swapClientOrgScopesAndIndexes replaces client.Scopes and rebuilds corp/alliance indexes atomically.
func (s *Server) swapClientOrgScopesAndIndexes(client *Client, next model.RealtimeScopes) {
	s.corpIndexMu.Lock()
	s.allianceIndexMu.Lock()
	defer s.allianceIndexMu.Unlock()
	defer s.corpIndexMu.Unlock()
	s.unregisterCorpPoolsLocked(client)
	s.unregisterAlliancePoolsLocked(client)
	client.Scopes = next
	s.registerCorpPoolsLocked(client)
	s.registerAlliancePoolsLocked(client)
}

// unregisterClientFromOrgPools removes this client from corp and alliance pools using current Scopes.
func (s *Server) unregisterClientFromOrgPools(client *Client) {
	s.corpIndexMu.Lock()
	s.allianceIndexMu.Lock()
	defer s.allianceIndexMu.Unlock()
	defer s.corpIndexMu.Unlock()
	s.unregisterCorpPoolsLocked(client)
	s.unregisterAlliancePoolsLocked(client)
}

// replaceScopesFromJWT returns org scopes filtered to ids present on the JWT ceiling for this connection.
func replaceScopesFromJWT(client *Client, corps, alliances []string) model.RealtimeScopes {
	next := model.RealtimeScopes{}
	for _, c := range corps {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		if client.allowedCorpJWT == nil {
			continue
		}
		if _, ok := client.allowedCorpJWT[c]; !ok {
			continue
		}
		next.CorporationIDs = append(next.CorporationIDs, c)
	}
	for _, a := range alliances {
		a = strings.TrimSpace(a)
		if a == "" {
			continue
		}
		if client.allowedAllianceJWT == nil {
			continue
		}
		if _, ok := client.allowedAllianceJWT[a]; !ok {
			continue
		}
		next.AllianceIDs = append(next.AllianceIDs, a)
	}
	return next
}

// unionDedupe returns a then any elements of b not already in a (trimmed, deduplicated).
func unionDedupe(a, b []string) []string {
	seen := stringSetFromSlice(a)
	out := append([]string(nil), a...)
	for _, x := range b {
		x = strings.TrimSpace(x)
		if x == "" {
			continue
		}
		if _, ok := seen[x]; ok {
			continue
		}
		seen[x] = struct{}{}
		out = append(out, x)
	}
	return out
}

// filterToAllowed keeps only ids present in allowed (empty allowed → no matches).
func filterToAllowed(allowed map[string]struct{}, in []string) []string {
	if len(allowed) == 0 {
		return nil
	}
	var out []string
	for _, raw := range in {
		id := strings.TrimSpace(raw)
		if id == "" {
			continue
		}
		if _, ok := allowed[id]; ok {
			out = append(out, id)
		}
	}
	return out
}
