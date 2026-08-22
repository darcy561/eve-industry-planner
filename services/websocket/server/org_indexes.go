package server

import (
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

// Lock order when both corp and alliance indexes are touched: corpRefIndexMu before allianceRefIndexMu.

func (s *Server) registerCorpPoolsLocked(client *Client) {
	if client == nil || client.id == "" {
		return
	}
	for _, cid := range client.Scopes.CorporationRefs {
		cid = strings.TrimSpace(cid)
		if cid == "" {
			continue
		}
		if s.corpRefToClients[cid] == nil {
			s.corpRefToClients[cid] = make(map[string]bool)
		}
		s.corpRefToClients[cid][client.id] = true
	}
}

func (s *Server) registerAlliancePoolsLocked(client *Client) {
	if client == nil || client.id == "" {
		return
	}
	for _, aid := range client.Scopes.AllianceRefs {
		aid = strings.TrimSpace(aid)
		if aid == "" {
			continue
		}
		if s.allianceRefToClients[aid] == nil {
			s.allianceRefToClients[aid] = make(map[string]bool)
		}
		s.allianceRefToClients[aid][client.id] = true
	}
}

func (s *Server) unregisterCorpPoolsLocked(client *Client) {
	if client == nil || client.id == "" {
		return
	}
	for _, cid := range client.Scopes.CorporationRefs {
		cid = strings.TrimSpace(cid)
		if cid == "" {
			continue
		}
		if m := s.corpRefToClients[cid]; m != nil {
			delete(m, client.id)
			if len(m) == 0 {
				delete(s.corpRefToClients, cid)
			}
		}
	}
}

func (s *Server) unregisterAlliancePoolsLocked(client *Client) {
	if client == nil || client.id == "" {
		return
	}
	for _, aid := range client.Scopes.AllianceRefs {
		aid = strings.TrimSpace(aid)
		if aid == "" {
			continue
		}
		if m := s.allianceRefToClients[aid]; m != nil {
			delete(m, client.id)
			if len(m) == 0 {
				delete(s.allianceRefToClients, aid)
			}
		}
	}
}

// swapClientOrgScopesAndIndexes replaces client.Scopes and rebuilds corp/alliance indexes atomically.
func (s *Server) swapClientOrgScopesAndIndexes(client *Client, next model.RealtimeScopes) {
	s.corpRefIndexMu.Lock()
	s.allianceRefIndexMu.Lock()
	s.unregisterCorpPoolsLocked(client)
	s.unregisterAlliancePoolsLocked(client)
	client.Scopes = next
	s.registerCorpPoolsLocked(client)
	s.registerAlliancePoolsLocked(client)
	s.allianceRefIndexMu.Unlock()
	s.corpRefIndexMu.Unlock()
	s.scheduleDocFanoutFilterReconcile()
}

// unregisterClientFromOrgPools removes this client from corp and alliance pools using current Scopes.
func (s *Server) unregisterClientFromOrgPools(client *Client) {
	s.corpRefIndexMu.Lock()
	s.allianceRefIndexMu.Lock()
	s.unregisterCorpPoolsLocked(client)
	s.unregisterAlliancePoolsLocked(client)
	s.allianceRefIndexMu.Unlock()
	s.corpRefIndexMu.Unlock()
	s.scheduleDocFanoutFilterReconcile()
}

// replaceScopesWithinSessionGrants returns org scopes filtered to ids allowed by this connection's session grants.
func replaceScopesWithinSessionGrants(client *Client, corps, alliances []string) model.RealtimeScopes {
	next := model.RealtimeScopes{}
	for _, c := range corps {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		if client.grantedCorpRefs == nil {
			continue
		}
		if _, ok := client.grantedCorpRefs[c]; !ok {
			continue
		}
		next.CorporationRefs = append(next.CorporationRefs, c)
	}
	for _, a := range alliances {
		a = strings.TrimSpace(a)
		if a == "" {
			continue
		}
		if client.grantedAllianceRefs == nil {
			continue
		}
		if _, ok := client.grantedAllianceRefs[a]; !ok {
			continue
		}
		next.AllianceRefs = append(next.AllianceRefs, a)
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
