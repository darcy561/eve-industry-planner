package server

import "eve-industry-planner/shared/models"

// pooledScopes are the scopes the owner index holds, which is every scope except
// the account's own: account delivery is keyed by userConnections, so indexing an
// account key here would put one connection in two places and report it as two
// hosted tenants.
func pooledScopes(client *Client) models.OwnerKeys {
	own := models.AccountOwner(client.AccountID)
	var out models.OwnerKeys
	client.Scopes.Each(func(key string) {
		if key != own.Key() {
			out = append(out, key)
		}
	})
	return out
}

func (s *Server) addToOwnerPoolsLocked(client *Client) {
	if client == nil || client.id == "" {
		return
	}
	pooledScopes(client).Each(func(key string) {
		if s.ownerKeyToClients[key] == nil {
			s.ownerKeyToClients[key] = make(map[string]bool)
		}
		s.ownerKeyToClients[key][client.id] = true
	})
}

func (s *Server) removeFromOwnerPoolsLocked(client *Client) {
	if client == nil || client.id == "" {
		return
	}
	pooledScopes(client).Each(func(key string) {
		pool := s.ownerKeyToClients[key]
		if pool == nil {
			return
		}
		delete(pool, client.id)
		if len(pool) == 0 {
			delete(s.ownerKeyToClients, key)
		}
	})
}

// setClientScopes replaces a client's scopes and moves it between owner pools to
// match, as one locked step so no fan-out sees the two disagree.
//
// Scopes are derived at connect; a planner switch replaces them through here,
// and so does a grant ceiling that has narrowed under an open connection.
func (s *Server) setClientScopes(client *Client, next models.OwnerKeys) {
	s.ownerIndexMu.Lock()
	s.removeFromOwnerPoolsLocked(client)
	client.Scopes = next
	s.addToOwnerPoolsLocked(client)
	s.ownerIndexMu.Unlock()
	s.scheduleDocFanoutFilterReconcile()
}

// setClientCeilingAndScopes holds a connection to a ceiling that has moved under
// it, in one locked step.
//
// Both together: a reader that saw the new ceiling beside the old scopes would
// believe the connection still receives a planner the account has left.
func (s *Server) setClientCeilingAndScopes(client *Client, ceiling, scopes models.OwnerKeys) {
	s.ownerIndexMu.Lock()
	s.removeFromOwnerPoolsLocked(client)
	client.Ceiling = ceiling
	client.Scopes = scopes
	s.addToOwnerPoolsLocked(client)
	s.ownerIndexMu.Unlock()
	s.scheduleDocFanoutFilterReconcile()
}

// clientScopesSnapshot reads a connection's scopes under the index lock, for a
// caller deciding what to narrow them to.
func (s *Server) clientScopesSnapshot(client *Client) models.OwnerKeys {
	s.ownerIndexMu.RLock()
	defer s.ownerIndexMu.RUnlock()
	return client.Scopes
}

// removeClientFromOwnerPools drops a client from every pool its scopes name, for
// a connection that is going away.
func (s *Server) removeClientFromOwnerPools(client *Client) {
	s.ownerIndexMu.Lock()
	s.removeFromOwnerPoolsLocked(client)
	s.ownerIndexMu.Unlock()
	s.scheduleDocFanoutFilterReconcile()
}

// clientsForOwner snapshots the clients receiving an owner's changes.
//
// A zero owner returns nothing: its key addresses no pool, and indexing on it
// would read one shared bucket rather than failing.
func (s *Server) clientsForOwner(owner models.Owner) []string {
	if owner.IsZero() {
		return nil
	}
	s.ownerIndexMu.RLock()
	defer s.ownerIndexMu.RUnlock()
	return copyClientIDSet(s.ownerKeyToClients[owner.Key()])
}
