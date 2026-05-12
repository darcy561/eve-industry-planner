package server

import (
	"context"
	"strings"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/websocket/server/outgoinglogic"
)

// deliverOutboundDocUpdate routes a NATS doc.update payload to local WebSocket clients.
// Precedence: accountID → corporationID → allianceID → explicit doc subscribers.
// Corporation/alliance paths use reverse indexes filled by upgrade_scopes (session grant ceiling).
func (s *Server) deliverOutboundDocUpdate(collectionScopedDocID string, messageData []byte) {
	ctx := context.Background()
	decoded, err := outgoinglogic.DecodeOutboundMessage(messageData)
	if err != nil {
		logs.WarnCtx(ctx, "outbound doc update: invalid JSON",
			"doc_id", collectionScopedDocID,
			"error", err.Error())
		return
	}

	if decoded.Route.AccountID != "" {
		s.broadcastToAccountClients(collectionScopedDocID, messageData, decoded.Route)
		return
	}

	if decoded.Route.CorporationID != "" {
		s.broadcastToCorporationScope(collectionScopedDocID, messageData, decoded)
		return
	}

	if decoded.Route.AllianceID != "" {
		s.broadcastToAllianceScope(collectionScopedDocID, messageData, decoded)
		return
	}

	s.deliverToExplicitDocSubscribers(collectionScopedDocID, messageData, decoded.Route.SourceClientID, decoded.Route.SourceSessionID)
}

// broadcastToAccountClients sends a payload to every connection for the account except the source client.
func (s *Server) broadcastToAccountClients(docID string, messageData []byte, route outgoinglogic.RouteInfo) {
	bcCtx := context.Background()
	accountID := route.AccountID
	if accountID == "" {
		logs.WarnCtx(bcCtx, "message missing accountID for account broadcast",
			"doc_id", docID)
		return
	}
	sourceClientID := route.SourceClientID
	sourceSessionID := route.SourceSessionID

	s.userConnMu.RLock()
	clientIDs, hasConnections := s.userConnections[accountID]
	if !hasConnections {
		s.userConnMu.RUnlock()
		logs.DebugCtx(bcCtx, "no clients connected for account",
			"account_id", accountID)
		return
	}

	clientsToNotify := make([]string, 0, len(clientIDs))
	for clientID := range clientIDs {
		clientsToNotify = append(clientsToNotify, clientID)
	}
	s.userConnMu.RUnlock()

	var (
		recipientClientIDs  []string
		skippedEcho         []string
		skippedSync         []string
		skippedNotConnected []string
	)
	broadcastCount := 0
	s.ClientsMu.RLock()
	for _, clientID := range clientsToNotify {
		client, exists := s.Clients[clientID]
		if !exists {
			skippedNotConnected = append(skippedNotConnected, clientID)
			continue
		}
		if outgoinglogic.ShouldSuppressRecipient(sourceSessionID, sourceClientID, client.SessionID, clientID) {
			skippedEcho = append(skippedEcho, clientID)
			continue
		}

		if client.AccountID != accountID {
			logs.WarnCtx(client.LogContext(), "client accountID mismatch",
				"client_id", clientID,
				"expected_account_id", accountID,
				"client_account_id", client.AccountID)
			continue
		}

		client.SyncMu.Lock()
		if client.SyncInProgress {
			client.SyncMu.Unlock()
			skippedSync = append(skippedSync, clientID)
			continue
		}
		client.SyncMu.Unlock()

		if outgoinglogic.TrySendNonBlocking(client.Send, messageData) {
			broadcastCount++
			recipientClientIDs = append(recipientClientIDs, clientID)
		} else {
			logs.WarnCtx(client.LogContext(), "client send buffer full, dropping message",
				"client_id", clientID,
				"account_id", accountID)
		}
	}
	s.ClientsMu.RUnlock()

	if broadcastCount > 0 {
		s.recordDocUpdateSent(bcCtx, accountID, docID, broadcastCount)
		logs.DebugCtx(bcCtx, "message broadcasted to account clients",
			"account_id", accountID,
			"doc_id", docID,
			"recipients", broadcastCount,
			"candidate_client_ids", strings.Join(clientsToNotify, ","),
			"recipient_client_ids", strings.Join(recipientClientIDs, ","),
			"skipped_echo_suppression_client_ids", strings.Join(skippedEcho, ","),
			"skipped_sync_in_progress_client_ids", strings.Join(skippedSync, ","),
			"skipped_not_connected_client_ids", strings.Join(skippedNotConnected, ","),
			"source_client_id", sourceClientID,
			"source_session_id", sourceSessionID)
	} else if len(clientsToNotify) > 0 {
		logs.DebugCtx(bcCtx, "account doc update: no recipients on this replica",
			"account_id", accountID,
			"doc_id", docID,
			"candidate_client_ids", strings.Join(clientsToNotify, ","),
			"skipped_echo_suppression_client_ids", strings.Join(skippedEcho, ","),
			"skipped_sync_in_progress_client_ids", strings.Join(skippedSync, ","),
			"skipped_not_connected_client_ids", strings.Join(skippedNotConnected, ","),
			"source_client_id", sourceClientID,
			"source_session_id", sourceSessionID)
	}
}

func copyClientIDSet(m map[string]bool) []string {
	if len(m) == 0 {
		return nil
	}
	out := make([]string, 0, len(m))
	for id := range m {
		out = append(out, id)
	}
	return out
}

func (s *Server) broadcastToCorporationScope(docID string, messageData []byte, decoded outgoinglogic.DecodedOutbound) {
	ctx := context.Background()
	corporationID := decoded.Route.CorporationID
	sourceClientID := decoded.Route.SourceClientID
	sourceSessionID := decoded.Route.SourceSessionID
	scopes := decoded.Scopes

	s.corpIndexMu.RLock()
	idsMap := s.corpToClients[corporationID]
	clientIDs := copyClientIDSet(idsMap)
	s.corpIndexMu.RUnlock()

	if len(clientIDs) == 0 {
		logs.DebugCtx(ctx, "corporation scope: no pooled clients for corporation",
			"doc_id", docID,
			"corporation_id", corporationID)
		return
	}

	var recipientIDs []string
	sent := 0
	s.ClientsMu.RLock()
	for _, clientID := range clientIDs {
		client, ok := s.Clients[clientID]
		if !ok {
			continue
		}
		if !outgoinglogic.CorporationRecipientMatchesDownward(client.AccountID, scopes) {
			continue
		}
		client.SyncMu.Lock()
		syncing := client.SyncInProgress
		client.SyncMu.Unlock()
		if !outgoinglogic.ScopeBroadcastRecipientDeliverable(
			client.Scopes.CorporationIDs, corporationID,
			client.SessionID, clientID,
			sourceSessionID, sourceClientID,
			syncing,
		) {
			continue
		}
		if outgoinglogic.TrySendNonBlocking(client.Send, messageData) {
			sent++
			recipientIDs = append(recipientIDs, clientID)
		} else {
			logs.WarnCtx(client.LogContext(), "corporation scope: send buffer full",
				"client_id", client.id,
				"corporation_id", corporationID)
		}
	}
	s.ClientsMu.RUnlock()

	if sent > 0 {
		logs.DebugCtx(ctx, "corporation scope broadcast",
			"doc_id", docID,
			"corporation_id", corporationID,
			"recipients", sent,
			"candidate_pool_client_ids", strings.Join(clientIDs, ","),
			"recipient_client_ids", strings.Join(recipientIDs, ","),
			"source_client_id", sourceClientID,
			"source_session_id", sourceSessionID)
	} else if len(clientIDs) > 0 {
		logs.DebugCtx(ctx, "corporation scope: no recipients on this replica",
			"doc_id", docID,
			"corporation_id", corporationID,
			"candidate_pool_client_ids", strings.Join(clientIDs, ","),
			"source_client_id", sourceClientID,
			"source_session_id", sourceSessionID)
	}
}

func (s *Server) broadcastToAllianceScope(docID string, messageData []byte, decoded outgoinglogic.DecodedOutbound) {
	ctx := context.Background()
	allianceID := decoded.Route.AllianceID
	sourceClientID := decoded.Route.SourceClientID
	sourceSessionID := decoded.Route.SourceSessionID
	scopes := decoded.Scopes

	s.allianceIndexMu.RLock()
	idsMap := s.allianceToClients[allianceID]
	clientIDs := copyClientIDSet(idsMap)
	s.allianceIndexMu.RUnlock()

	if len(clientIDs) == 0 {
		logs.DebugCtx(ctx, "alliance scope: no pooled clients for alliance",
			"doc_id", docID,
			"alliance_id", allianceID)
		return
	}

	var recipientIDs []string
	sent := 0
	s.ClientsMu.RLock()
	for _, clientID := range clientIDs {
		client, ok := s.Clients[clientID]
		if !ok {
			continue
		}
		corpScope := append([]string(nil), client.Scopes.CorporationIDs...)
		if !outgoinglogic.AllianceRecipientMatchesDownward(corpScope, client.AccountID, scopes) {
			continue
		}
		client.SyncMu.Lock()
		syncing := client.SyncInProgress
		client.SyncMu.Unlock()
		if !outgoinglogic.ScopeBroadcastRecipientDeliverable(
			client.Scopes.AllianceIDs, allianceID,
			client.SessionID, clientID,
			sourceSessionID, sourceClientID,
			syncing,
		) {
			continue
		}
		if outgoinglogic.TrySendNonBlocking(client.Send, messageData) {
			sent++
			recipientIDs = append(recipientIDs, clientID)
		} else {
			logs.WarnCtx(client.LogContext(), "alliance scope: send buffer full",
				"client_id", client.id,
				"alliance_id", allianceID)
		}
	}
	s.ClientsMu.RUnlock()

	if sent > 0 {
		logs.DebugCtx(ctx, "alliance scope broadcast",
			"doc_id", docID,
			"alliance_id", allianceID,
			"recipients", sent,
			"candidate_pool_client_ids", strings.Join(clientIDs, ","),
			"recipient_client_ids", strings.Join(recipientIDs, ","),
			"source_client_id", sourceClientID,
			"source_session_id", sourceSessionID)
	} else if len(clientIDs) > 0 {
		logs.DebugCtx(ctx, "alliance scope: no recipients on this replica",
			"doc_id", docID,
			"alliance_id", allianceID,
			"candidate_pool_client_ids", strings.Join(clientIDs, ","),
			"source_client_id", sourceClientID,
			"source_session_id", sourceSessionID)
	}
}

// deliverToExplicitDocSubscribers delivers to clients that opted into this doc id (legacy / escape hatch).
func (s *Server) deliverToExplicitDocSubscribers(docID string, messageData []byte, sourceClientID, sourceSessionID string) {
	ctx := context.Background()

	s.explicitDocSubMu.RLock()
	subSet := s.explicitDocSubscribers[docID]
	if len(subSet) == 0 {
		s.explicitDocSubMu.RUnlock()
		logs.DebugCtx(ctx, "doc update: no explicit subscribers and no account/corp/alliance route",
			"doc_id", docID)
		return
	}
	clientIDs := make([]string, 0, len(subSet))
	for cid := range subSet {
		clientIDs = append(clientIDs, cid)
	}
	s.explicitDocSubMu.RUnlock()

	var recipientIDs []string
	sent := 0
	s.ClientsMu.RLock()
	for _, clientID := range clientIDs {
		client, ok := s.Clients[clientID]
		if !ok {
			continue
		}
		client.SyncMu.Lock()
		syncing := client.SyncInProgress
		client.SyncMu.Unlock()
		if !outgoinglogic.ExplicitDocRecipientDeliverable(
			docID,
			client.SessionID, clientID,
			sourceSessionID, sourceClientID,
			client.explicitDocIDs[docID],
			syncing,
		) {
			continue
		}
		if outgoinglogic.TrySendNonBlocking(client.Send, messageData) {
			sent++
			recipientIDs = append(recipientIDs, clientID)
		} else {
			logs.WarnCtx(client.LogContext(), "explicit doc: send buffer full",
				"client_id", clientID,
				"doc_id", docID)
		}
	}
	s.ClientsMu.RUnlock()

	if sent > 0 {
		logs.DebugCtx(ctx, "doc update delivered to explicit subscribers",
			"doc_id", docID,
			"recipients", sent,
			"candidate_explicit_client_ids", strings.Join(clientIDs, ","),
			"recipient_client_ids", strings.Join(recipientIDs, ","),
			"source_client_id", sourceClientID,
			"source_session_id", sourceSessionID)
	} else if len(clientIDs) > 0 {
		logs.DebugCtx(ctx, "explicit doc update: no recipients on this replica",
			"doc_id", docID,
			"candidate_explicit_client_ids", strings.Join(clientIDs, ","),
			"source_client_id", sourceClientID,
			"source_session_id", sourceSessionID)
	}
}
