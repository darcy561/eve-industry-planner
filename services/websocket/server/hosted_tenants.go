package server

import (
	"sort"
	"strings"

	"eve-industry-planner/shared/models"
)

// Hosted-tenant helpers are a read-only view over connection indexes already maintained
// for fan-out and per-account caps — no second store:
//
//	account:{id}      → userConnections (non-empty client set)
//	corporation:{id}  → corpRefToClients
//	alliance:{id}     → allianceRefToClients
//
// "Hosted" means the outer map has that id with at least one client id — not the size of
// Clients. Socket load for soft/full still uses len(Clients).
//
// Lock order when taking more than one: userConnMu, then corpRefIndexMu, then allianceRefIndexMu.

// HostsTenant reports whether this replica has any local client for the tenant key.
func (s *Server) HostsTenant(tenantKey string) bool {
	if s == nil {
		return false
	}
	owner, err := models.ParseOwnerKey(strings.TrimSpace(tenantKey))
	if err != nil {
		return false
	}
	switch owner.Kind {
	case models.OwnerAccount:
		s.userConnMu.RLock()
		hosted := len(s.userConnections[owner.ID]) > 0
		s.userConnMu.RUnlock()
		return hosted
	case models.OwnerCorporation:
		s.corpRefIndexMu.RLock()
		hosted := len(s.corpRefToClients[owner.ID]) > 0
		s.corpRefIndexMu.RUnlock()
		return hosted
	case models.OwnerAlliance:
		s.allianceRefIndexMu.RLock()
		hosted := len(s.allianceRefToClients[owner.ID]) > 0
		s.allianceRefIndexMu.RUnlock()
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
	s.corpRefIndexMu.RLock()
	s.allianceRefIndexMu.RLock()
	out := make([]string, 0, len(s.userConnections)+len(s.corpRefToClients)+len(s.allianceRefToClients))
	for id, clients := range s.userConnections {
		if len(clients) == 0 {
			continue
		}
		if owner := models.AccountOwner(id); owner.Validate() == nil {
			out = append(out, owner.Key())
		}
	}
	for id, clients := range s.corpRefToClients {
		if len(clients) == 0 {
			continue
		}
		if owner := models.CorporationOwner(id); owner.Validate() == nil {
			out = append(out, owner.Key())
		}
	}
	for id, clients := range s.allianceRefToClients {
		if len(clients) == 0 {
			continue
		}
		if owner := models.AllianceOwner(id); owner.Validate() == nil {
			out = append(out, owner.Key())
		}
	}
	s.allianceRefIndexMu.RUnlock()
	s.corpRefIndexMu.RUnlock()
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
	s.corpRefIndexMu.RLock()
	s.allianceRefIndexMu.RLock()
	n := 0
	for _, clients := range s.userConnections {
		if len(clients) > 0 {
			n++
		}
	}
	for _, clients := range s.corpRefToClients {
		if len(clients) > 0 {
			n++
		}
	}
	for _, clients := range s.allianceRefToClients {
		if len(clients) > 0 {
			n++
		}
	}
	s.allianceRefIndexMu.RUnlock()
	s.corpRefIndexMu.RUnlock()
	s.userConnMu.RUnlock()
	return n
}
