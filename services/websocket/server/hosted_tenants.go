package server

import (
	"sort"
	"strings"

	"eve-industry-planner/shared/wsplacement"
)

// Hosted-tenant helpers are a read-only view over connection indexes already maintained
// for fan-out and per-account caps — no second store:
//
//	account:{id}      → userConnections (non-empty client set)
//	corporation:{id}  → corpToClients
//	alliance:{id}     → allianceToClients
//
// "Hosted" means the outer map has that id with at least one client id — not the size of
// Clients. Socket load for soft/full still uses len(Clients).
//
// Lock order when taking more than one: userConnMu, then corpIndexMu, then allianceIndexMu.

// HostsTenant reports whether this replica has any local client for the tenant key.
func (s *Server) HostsTenant(tenantKey string) bool {
	if s == nil {
		return false
	}
	key := strings.TrimSpace(tenantKey)
	switch {
	case strings.HasPrefix(key, wsplacement.TenantPrefixAccount):
		id := strings.TrimSpace(strings.TrimPrefix(key, wsplacement.TenantPrefixAccount))
		if id == "" {
			return false
		}
		s.userConnMu.RLock()
		hosted := len(s.userConnections[id]) > 0
		s.userConnMu.RUnlock()
		return hosted
	case strings.HasPrefix(key, wsplacement.TenantPrefixCorporation):
		id := strings.TrimSpace(strings.TrimPrefix(key, wsplacement.TenantPrefixCorporation))
		if id == "" {
			return false
		}
		s.corpIndexMu.RLock()
		hosted := len(s.corpToClients[id]) > 0
		s.corpIndexMu.RUnlock()
		return hosted
	case strings.HasPrefix(key, wsplacement.TenantPrefixAlliance):
		id := strings.TrimSpace(strings.TrimPrefix(key, wsplacement.TenantPrefixAlliance))
		if id == "" {
			return false
		}
		s.allianceIndexMu.RLock()
		hosted := len(s.allianceToClients[id]) > 0
		s.allianceIndexMu.RUnlock()
		return hosted
	default:
		return false
	}
}

// HostedTenants returns a sorted snapshot of tenant keys this replica hosts
// (one entry per account / corporation / alliance id with a local client).
func (s *Server) HostedTenants() []string {
	if s == nil {
		return nil
	}
	s.userConnMu.RLock()
	s.corpIndexMu.RLock()
	s.allianceIndexMu.RLock()
	out := make([]string, 0, len(s.userConnections)+len(s.corpToClients)+len(s.allianceToClients))
	for id, clients := range s.userConnections {
		if len(clients) == 0 {
			continue
		}
		if k := wsplacement.TenantKeyAccount(id); k != "" {
			out = append(out, k)
		}
	}
	for id, clients := range s.corpToClients {
		if len(clients) == 0 {
			continue
		}
		if k := wsplacement.TenantKeyCorporation(id); k != "" {
			out = append(out, k)
		}
	}
	for id, clients := range s.allianceToClients {
		if len(clients) == 0 {
			continue
		}
		if k := wsplacement.TenantKeyAlliance(id); k != "" {
			out = append(out, k)
		}
	}
	s.allianceIndexMu.RUnlock()
	s.corpIndexMu.RUnlock()
	s.userConnMu.RUnlock()
	sort.Strings(out)
	return out
}

// HostedTenantCount returns the number of distinct hosted tenant keys
// (accounts + corporations + alliances), not the number of sockets.
func (s *Server) HostedTenantCount() int {
	if s == nil {
		return 0
	}
	s.userConnMu.RLock()
	s.corpIndexMu.RLock()
	s.allianceIndexMu.RLock()
	n := 0
	for _, clients := range s.userConnections {
		if len(clients) > 0 {
			n++
		}
	}
	for _, clients := range s.corpToClients {
		if len(clients) > 0 {
			n++
		}
	}
	for _, clients := range s.allianceToClients {
		if len(clients) > 0 {
			n++
		}
	}
	s.allianceIndexMu.RUnlock()
	s.corpIndexMu.RUnlock()
	s.userConnMu.RUnlock()
	return n
}
