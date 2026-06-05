package server

import (
	"context"
	"fmt"
	"strings"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/websocket/server/outgoinglogic"
	"eve-industry-planner/websocket/server/subscriptionlogic"
)

func (s *Server) addExplicitSubscriber(clientID, docID string) {
	if docID == "" || clientID == "" {
		return
	}
	s.explicitDocSubMu.Lock()
	defer s.explicitDocSubMu.Unlock()
	if s.explicitDocSubscribers[docID] == nil {
		s.explicitDocSubscribers[docID] = make(map[string]bool)
	}
	s.explicitDocSubscribers[docID][clientID] = true
}

func (s *Server) removeExplicitSubscriber(clientID, docID string) {
	if docID == "" || clientID == "" {
		return
	}
	s.explicitDocSubMu.Lock()
	defer s.explicitDocSubMu.Unlock()
	if m, ok := s.explicitDocSubscribers[docID]; ok {
		delete(m, clientID)
		if len(m) == 0 {
			delete(s.explicitDocSubscribers, docID)
		}
	}
}

// cleanupClientSubscriptions removes explicit doc entries when a socket disconnects.
func (s *Server) cleanupClientSubscriptions(clientID string, accountID string, explicitSnapshot map[string]bool) {
	if len(explicitSnapshot) == 0 {
		return
	}
	for docID := range explicitSnapshot {
		s.removeExplicitSubscriber(clientID, docID)
	}
	if len(explicitSnapshot) > 0 {
		logs.DebugCtx(context.Background(), "cleaned explicit subscription index on disconnect",
			"account_id", accountID,
			"client_id", clientID,
			"doc_ids", subscriptionlogic.Keys(explicitSnapshot))
	}
}

// ReplaceClientSubscriptions records explicit doc ids from a sync payload (escape hatch / tooling).
// Account-scoped realtime does not depend on this map.
func (s *Server) ReplaceClientSubscriptions(clientID string, accountID string, newSubscriptions map[string][]string) error {
	s.ClientsMu.Lock()
	client, exists := s.Clients[clientID]
	if !exists {
		s.ClientsMu.Unlock()
		return fmt.Errorf("client not found: %s", clientID)
	}

	if client.AccountID != accountID {
		s.ClientsMu.Unlock()
		return fmt.Errorf("client account mismatch: expected %s, got %s", accountID, client.AccountID)
	}

	old := make(map[string]bool, len(client.explicitDocIDs))
	for id := range client.explicitDocIDs {
		old[id] = true
	}

	newSet := subscriptionlogic.BuildScopedDocSet(newSubscriptions)
	toRemove, toAdd := subscriptionlogic.DiffSubscriptionSets(old, newSet)

	for _, docID := range toRemove {
		delete(client.explicitDocIDs, docID)
		s.removeExplicitSubscriber(clientID, docID)
	}
	for _, docID := range toAdd {
		client.explicitDocIDs[docID] = true
		s.addExplicitSubscriber(clientID, docID)
	}
	s.ClientsMu.Unlock()

	s.activeSubsMu.Lock()
	now := time.Now()
	rebuilt := subscriptionlogic.RebuildClientActiveSubscriptions(newSet, now)
	if rebuilt == nil {
		delete(s.activeSubscriptions, clientID)
	} else {
		s.activeSubscriptions[clientID] = rebuilt
	}
	s.activeSubsMu.Unlock()

	logs.DebugCtx(client.LogContext(), "replaced client explicit doc set from sync",
		"client_id", clientID,
		"account_id", accountID,
		"doc_count", len(newSet))

	return nil
}

// handleSubscribeRequest registers explicit doc ids (authorized). Account stream needs no subscribe.
func (s *Server) handleSubscribeRequest(clientID string, docID string) {
	subCtx := s.clientLogCtx(clientID)
	s.ClientsMu.Lock()
	client, exists := s.Clients[clientID]
	if !exists {
		s.ClientsMu.Unlock()
		logs.DebugCtx(subCtx, "client not found for subscribe request",
			"client_id", clientID,
			"doc_id", docID)
		return
	}
	accountID := client.AccountID
	if !s.docSubscribeAuthorized(context.Background(), docID, accountID) {
		s.ClientsMu.Unlock()
		logs.WarnCtx(subCtx, "subscribe request rejected: docID not authorized for account",
			"client_id", clientID,
			"account_id", accountID,
			"doc_id", docID)
		return
	}
	client.explicitDocIDs[docID] = true
	s.ClientsMu.Unlock()

	s.addExplicitSubscriber(clientID, docID)

	s.activeSubsMu.Lock()
	if s.activeSubscriptions[clientID] == nil {
		s.activeSubscriptions[clientID] = make(map[string]time.Time)
	}
	s.activeSubscriptions[clientID][docID] = time.Now()
	s.activeSubsMu.Unlock()
}

func (s *Server) handleUnsubscribeRequest(clientID string, docID string) {
	unsubCtx := s.clientLogCtx(clientID)
	s.ClientsMu.Lock()
	client, exists := s.Clients[clientID]
	if !exists {
		s.ClientsMu.Unlock()
		logs.DebugCtx(unsubCtx, "client not found for unsubscribe request",
			"client_id", clientID,
			"doc_id", docID)
		return
	}
	accountID := client.AccountID
	if !s.docSubscribeAuthorized(context.Background(), docID, accountID) {
		s.ClientsMu.Unlock()
		logs.WarnCtx(unsubCtx, "unsubscribe rejected: docID not authorized for account",
			"client_id", clientID,
			"account_id", accountID,
			"doc_id", docID)
		return
	}
	delete(client.explicitDocIDs, docID)
	s.ClientsMu.Unlock()

	s.removeExplicitSubscriber(clientID, docID)

	s.activeSubsMu.Lock()
	if s.activeSubscriptions[clientID] != nil {
		delete(s.activeSubscriptions[clientID], docID)
		if len(s.activeSubscriptions[clientID]) == 0 {
			delete(s.activeSubscriptions, clientID)
		}
	}
	s.activeSubsMu.Unlock()
}

// broadcastRawToAccount delivers a pre-marshaled JSON message to every connection for the account.
func (s *Server) broadcastRawToAccount(accountID string, data []byte, suppressSessionID string) outboundDeliveryOutcome {
	out := outboundDeliveryOutcome{
		RouteKind:         "doc_lock",
		AccountID:         accountID,
		SuppressSessionID: strings.TrimSpace(suppressSessionID),
	}
	if accountID == "" || len(data) == 0 {
		return out
	}
	s.userConnMu.RLock()
	userConns, ok := s.userConnections[accountID]
	if !ok || len(userConns) == 0 {
		s.userConnMu.RUnlock()
		return out
	}
	ids := make([]string, 0, len(userConns))
	for id := range userConns {
		ids = append(ids, id)
	}
	s.userConnMu.RUnlock()
	out.CandidateCount = len(ids)

	s.ClientsMu.RLock()
	defer s.ClientsMu.RUnlock()
	for _, cid := range ids {
		client, exists := s.Clients[cid]
		if !exists || !outgoinglogic.RawAccountRecipientDeliverable(accountID, client.AccountID) {
			if !exists {
				out.recordNotConnectedSkip(cid)
			}
			continue
		}
		if suppressSessionID != "" && client.SessionID == suppressSessionID {
			out.recordSessionSkip(cid)
			continue
		}
		if outgoinglogic.TrySendNonBlocking(client.Send, data) {
			out.RecipientCount++
			out.recordRecipient(cid, client)
		} else {
			out.recordSendBufferFull(cid)
			logs.WarnCtx(context.Background(), "doc lock: client send buffer full",
				"client_id", cid)
		}
	}
	if out.RecipientCount > 0 {
		out.RecipientAccountIDs = appendUniqueString(out.RecipientAccountIDs, accountID)
	}
	return out
}

// QueueSubscribeAck sends a lightweight ack after explicit subscribe JSON (optional for clients).
func (s *Server) QueueSubscribeAck(client *Client, docIDs []string) bool {
	if client == nil || len(docIDs) == 0 {
		return false
	}
	b, err := subscriptionlogic.MarshalSubscribeAck(docIDs)
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
