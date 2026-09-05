package server

import (
	"context"
	"slices"
	"strings"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/websocket/server/outgoinglogic"
)

// outboundDeliveryOutcome summarizes fan-out on this websocket replica.
type outboundDeliveryOutcome struct {
	RouteKind                      string
	RecipientCount                 int
	CandidateCount                 int
	AccountID                      string
	CorporationRef                 string
	AllianceRef                    string
	SourceClientID                 string
	SourceSessionID                string
	SuppressSessionID              string
	RecipientClientIDs             []string
	RecipientSessionIDs            []string
	RecipientAccountIDs            []string
	SkippedEchoClientIDs           []string
	SkippedSessionClientIDs        []string
	SkippedSyncClientIDs           []string
	SkippedNotConnectedClientIDs   []string
	SkippedScopeClientIDs          []string
	SkippedSendBufferFullClientIDs []string
}

func appendUniqueString(list []string, value string) []string {
	value = strings.TrimSpace(value)
	if value == "" {
		return list
	}
	if slices.Contains(list, value) {
		return list
	}
	return append(list, value)
}

func (o *outboundDeliveryOutcome) recordRecipient(clientID string, client *Client) {
	o.RecipientClientIDs = append(o.RecipientClientIDs, clientID)
	if client == nil {
		return
	}
	o.RecipientSessionIDs = appendUniqueString(o.RecipientSessionIDs, client.SessionID)
	o.RecipientAccountIDs = appendUniqueString(o.RecipientAccountIDs, client.AccountID)
}

func (o *outboundDeliveryOutcome) recordEchoSkip(clientID string) {
	o.SkippedEchoClientIDs = append(o.SkippedEchoClientIDs, clientID)
}

func (o *outboundDeliveryOutcome) recordSessionSkip(clientID string) {
	o.SkippedSessionClientIDs = append(o.SkippedSessionClientIDs, clientID)
}

func (o *outboundDeliveryOutcome) recordSyncSkip(clientID string) {
	o.SkippedSyncClientIDs = append(o.SkippedSyncClientIDs, clientID)
}

func (o *outboundDeliveryOutcome) recordNotConnectedSkip(clientID string) {
	o.SkippedNotConnectedClientIDs = append(o.SkippedNotConnectedClientIDs, clientID)
}

func (o *outboundDeliveryOutcome) recordScopeSkip(clientID string) {
	o.SkippedScopeClientIDs = append(o.SkippedScopeClientIDs, clientID)
}

func (o *outboundDeliveryOutcome) recordSendBufferFull(clientID string) {
	o.SkippedSendBufferFullClientIDs = append(o.SkippedSendBufferFullClientIDs, clientID)
}

func (o *outboundDeliveryOutcome) hasSuppression() bool {
	return len(o.SkippedEchoClientIDs) > 0 ||
		len(o.SkippedSessionClientIDs) > 0 ||
		len(o.SkippedSyncClientIDs) > 0 ||
		len(o.SkippedNotConnectedClientIDs) > 0 ||
		len(o.SkippedScopeClientIDs) > 0 ||
		len(o.SkippedSendBufferFullClientIDs) > 0 ||
		o.SuppressSessionID != ""
}

// deliverOutboundDocUpdate routes a NATS doc.update payload to local WebSocket clients.
// The owner's kind selects the branch; a message stating no readable owner goes to
// explicit doc subscribers.
func (s *Server) deliverOutboundDocUpdate(ctx context.Context, collectionScopedDocID string, messageData []byte) outboundDeliveryOutcome {
	decoded, err := outgoinglogic.DecodeOutboundMessage(messageData)
	if err != nil {
		logs.WarnCtx(ctx, "outbound doc update: invalid JSON",
			"doc_id", collectionScopedDocID,
			"error", err.Error())
		return outboundDeliveryOutcome{RouteKind: "invalid"}
	}

	// Routing metadata names internal identities and the document body carries
	// refs; rewrite once here rather than per recipient, after routing has been
	// decided from the untouched message, so no ref reaches a browser.
	clientData := outgoinglogic.ClientPayload(messageData, s.entityCipher)

	switch decoded.Route.Owner.Kind {
	case models.OwnerAccount:
		return s.broadcastToAccountClients(ctx, collectionScopedDocID, clientData, decoded.Route)
	case models.OwnerCorporation:
		return s.broadcastToCorporationScope(ctx, collectionScopedDocID, clientData, decoded)
	case models.OwnerAlliance:
		return s.broadcastToAllianceScope(ctx, collectionScopedDocID, clientData, decoded)
	case "":
		// No readable owner: a delete without a preimage, or a message from a
		// producer that stated none.
	default:
		// A kind the owner model accepts but this service cannot deliver to. Named
		// rather than passed to explicit subscribers unremarked, which would report
		// a near-empty fan-out as an ordinary one.
		logs.WarnCtx(ctx, "outbound doc update: no delivery branch for owner kind",
			"doc_id", collectionScopedDocID,
			"owner_kind", string(decoded.Route.Owner.Kind))
	}
	return s.deliverToExplicitDocSubscribers(ctx, collectionScopedDocID, clientData, decoded.Route.SourceClientID, decoded.Route.SourceSessionID)
}

// broadcastToAccountClients sends a payload to every connection for the account except the source client.
func (s *Server) broadcastToAccountClients(ctx context.Context, docID string, messageData []byte, route outgoinglogic.RouteInfo) outboundDeliveryOutcome {
	out := outboundDeliveryOutcome{
		RouteKind:       "account",
		AccountID:       route.Owner.ID,
		SourceClientID:  route.SourceClientID,
		SourceSessionID: route.SourceSessionID,
	}
	accountID := route.Owner.ID
	if accountID == "" {
		logs.WarnCtx(ctx, "message missing accountID for account broadcast", "doc_id", docID)
		return outboundDeliveryOutcome{RouteKind: "invalid"}
	}
	sourceClientID := route.SourceClientID
	sourceSessionID := route.SourceSessionID

	s.userConnMu.RLock()
	clientIDs, hasConnections := s.userConnections[accountID]
	if !hasConnections {
		s.userConnMu.RUnlock()
		return out
	}

	clientsToNotify := make([]string, 0, len(clientIDs))
	for clientID := range clientIDs {
		clientsToNotify = append(clientsToNotify, clientID)
	}
	s.userConnMu.RUnlock()
	out.CandidateCount = len(clientsToNotify)

	broadcastCount := 0
	s.ClientsMu.RLock()
	for _, clientID := range clientsToNotify {
		client, exists := s.Clients[clientID]
		if !exists {
			out.recordNotConnectedSkip(clientID)
			continue
		}
		if outgoinglogic.ShouldSuppressRecipient(sourceSessionID, sourceClientID, client.SessionID, clientID) {
			out.recordEchoSkip(clientID)
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
			out.recordSyncSkip(clientID)
			continue
		}
		client.SyncMu.Unlock()

		if outgoinglogic.TrySendNonBlocking(client.Send, messageData) {
			broadcastCount++
			out.recordRecipient(clientID, client)
		} else {
			out.recordSendBufferFull(clientID)
			logs.WarnCtx(client.LogContext(), "client send buffer full, dropping message",
				"client_id", clientID,
				"account_id", accountID)
		}
	}
	s.ClientsMu.RUnlock()

	out.RecipientCount = broadcastCount
	if broadcastCount > 0 {
		s.recordDocUpdateSent(ctx, accountID, docID, broadcastCount)
		out.RecipientAccountIDs = appendUniqueString(out.RecipientAccountIDs, accountID)
	}
	return out
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

func (s *Server) broadcastToCorporationScope(ctx context.Context, docID string, messageData []byte, decoded outgoinglogic.DecodedOutbound) outboundDeliveryOutcome {
	out := outboundDeliveryOutcome{
		RouteKind:       "corporation",
		CorporationRef:  decoded.Route.Owner.ID,
		SourceClientID:  decoded.Route.SourceClientID,
		SourceSessionID: decoded.Route.SourceSessionID,
	}
	corporationRef := decoded.Route.Owner.ID
	sourceClientID := decoded.Route.SourceClientID
	sourceSessionID := decoded.Route.SourceSessionID
	scopes := decoded.Scopes

	s.corpRefIndexMu.RLock()
	idsMap := s.corpRefToClients[corporationRef]
	clientIDs := copyClientIDSet(idsMap)
	s.corpRefIndexMu.RUnlock()
	out.CandidateCount = len(clientIDs)

	if len(clientIDs) == 0 {
		return out
	}

	var sent int
	s.ClientsMu.RLock()
	for _, clientID := range clientIDs {
		client, ok := s.Clients[clientID]
		if !ok {
			out.recordNotConnectedSkip(clientID)
			continue
		}
		if !outgoinglogic.CorporationRecipientMatchesDownward(client.AccountID, scopes) {
			out.recordScopeSkip(clientID)
			continue
		}
		client.SyncMu.Lock()
		syncing := client.SyncInProgress
		client.SyncMu.Unlock()
		if !outgoinglogic.ScopeContains(client.Scopes.CorporationRefs, corporationRef) {
			out.recordScopeSkip(clientID)
			continue
		}
		if outgoinglogic.ShouldSuppressRecipient(sourceSessionID, sourceClientID, client.SessionID, clientID) {
			out.recordEchoSkip(clientID)
			continue
		}
		if syncing {
			out.recordSyncSkip(clientID)
			continue
		}
		if outgoinglogic.TrySendNonBlocking(client.Send, messageData) {
			sent++
			out.recordRecipient(clientID, client)
		} else {
			out.recordSendBufferFull(clientID)
			logs.WarnCtx(client.LogContext(), "corporation scope: send buffer full",
				"client_id", client.id,
				"corporation_ref", corporationRef)
		}
	}
	s.ClientsMu.RUnlock()

	out.RecipientCount = sent
	return out
}

func (s *Server) broadcastToAllianceScope(ctx context.Context, docID string, messageData []byte, decoded outgoinglogic.DecodedOutbound) outboundDeliveryOutcome {
	out := outboundDeliveryOutcome{
		RouteKind:       "alliance",
		AllianceRef:     decoded.Route.Owner.ID,
		SourceClientID:  decoded.Route.SourceClientID,
		SourceSessionID: decoded.Route.SourceSessionID,
	}
	allianceRef := decoded.Route.Owner.ID
	sourceClientID := decoded.Route.SourceClientID
	sourceSessionID := decoded.Route.SourceSessionID
	scopes := decoded.Scopes

	s.allianceRefIndexMu.RLock()
	idsMap := s.allianceRefToClients[allianceRef]
	clientIDs := copyClientIDSet(idsMap)
	s.allianceRefIndexMu.RUnlock()
	out.CandidateCount = len(clientIDs)

	if len(clientIDs) == 0 {
		return out
	}

	var sent int
	s.ClientsMu.RLock()
	for _, clientID := range clientIDs {
		client, ok := s.Clients[clientID]
		if !ok {
			out.recordNotConnectedSkip(clientID)
			continue
		}
		corpScope := append([]string(nil), client.Scopes.CorporationRefs...)
		if !outgoinglogic.AllianceRecipientMatchesDownward(corpScope, client.AccountID, scopes) {
			out.recordScopeSkip(clientID)
			continue
		}
		client.SyncMu.Lock()
		syncing := client.SyncInProgress
		client.SyncMu.Unlock()
		if !outgoinglogic.ScopeContains(client.Scopes.AllianceRefs, allianceRef) {
			out.recordScopeSkip(clientID)
			continue
		}
		if outgoinglogic.ShouldSuppressRecipient(sourceSessionID, sourceClientID, client.SessionID, clientID) {
			out.recordEchoSkip(clientID)
			continue
		}
		if syncing {
			out.recordSyncSkip(clientID)
			continue
		}
		if outgoinglogic.TrySendNonBlocking(client.Send, messageData) {
			sent++
			out.recordRecipient(clientID, client)
		} else {
			out.recordSendBufferFull(clientID)
			logs.WarnCtx(client.LogContext(), "alliance scope: send buffer full",
				"client_id", client.id,
				"alliance_ref", allianceRef)
		}
	}
	s.ClientsMu.RUnlock()

	out.RecipientCount = sent
	return out
}

// deliverToExplicitDocSubscribers delivers to clients that subscribed to this
// doc id by name, rather than reaching it through account or org scope.
func (s *Server) deliverToExplicitDocSubscribers(ctx context.Context, docID string, messageData []byte, sourceClientID, sourceSessionID string) outboundDeliveryOutcome {
	out := outboundDeliveryOutcome{
		RouteKind:       "explicit",
		SourceClientID:  sourceClientID,
		SourceSessionID: sourceSessionID,
	}

	s.explicitDocSubMu.RLock()
	subSet := s.explicitDocSubscribers[docID]
	if len(subSet) == 0 {
		s.explicitDocSubMu.RUnlock()
		return out
	}
	clientIDs := make([]string, 0, len(subSet))
	for cid := range subSet {
		clientIDs = append(clientIDs, cid)
	}
	s.explicitDocSubMu.RUnlock()
	out.CandidateCount = len(clientIDs)

	var sent int
	s.ClientsMu.RLock()
	for _, clientID := range clientIDs {
		client, ok := s.Clients[clientID]
		if !ok {
			out.recordNotConnectedSkip(clientID)
			continue
		}
		client.SyncMu.Lock()
		syncing := client.SyncInProgress
		client.SyncMu.Unlock()
		if outgoinglogic.ShouldSuppressRecipient(sourceSessionID, sourceClientID, client.SessionID, clientID) {
			out.recordEchoSkip(clientID)
			continue
		}
		if docID == "" || !client.explicitDocIDs[docID] {
			out.recordScopeSkip(clientID)
			continue
		}
		if syncing {
			out.recordSyncSkip(clientID)
			continue
		}
		if outgoinglogic.TrySendNonBlocking(client.Send, messageData) {
			sent++
			out.recordRecipient(clientID, client)
		} else {
			out.recordSendBufferFull(clientID)
			logs.WarnCtx(client.LogContext(), "explicit doc: send buffer full",
				"client_id", clientID,
				"doc_id", docID)
		}
	}
	s.ClientsMu.RUnlock()

	out.RecipientCount = sent
	return out
}

func outboundDeliveryDetail(docID, subject string, o outboundDeliveryOutcome) map[string]any {
	detail := map[string]any{
		"doc_id":          docID,
		"route_kind":      o.RouteKind,
		"recipient_count": o.RecipientCount,
		"candidate_count": o.CandidateCount,
	}
	if subject != "" {
		detail["subject"] = subject
	}
	if o.AccountID != "" {
		detail["account_id"] = o.AccountID
	}
	if o.CorporationRef != "" {
		detail["corporation_ref"] = o.CorporationRef
	}
	if o.AllianceRef != "" {
		detail["alliance_ref"] = o.AllianceRef
	}
	if o.SourceClientID != "" {
		detail["source_client_id"] = o.SourceClientID
	}
	if o.SourceSessionID != "" {
		detail["source_session_id"] = o.SourceSessionID
	}
	if o.SuppressSessionID != "" {
		detail["suppress_session_id"] = o.SuppressSessionID
	}
	appendSkipDetail(detail, "skipped_echo_suppression_client_ids", o.SkippedEchoClientIDs)
	appendSkipDetail(detail, "skipped_session_suppression_client_ids", o.SkippedSessionClientIDs)
	appendSkipDetail(detail, "skipped_sync_in_progress_client_ids", o.SkippedSyncClientIDs)
	appendSkipDetail(detail, "skipped_not_connected_client_ids", o.SkippedNotConnectedClientIDs)
	appendSkipDetail(detail, "skipped_scope_client_ids", o.SkippedScopeClientIDs)
	appendSkipDetail(detail, "skipped_send_buffer_full_client_ids", o.SkippedSendBufferFullClientIDs)
	if len(o.RecipientClientIDs) > 0 {
		detail["recipient_client_ids"] = strings.Join(o.RecipientClientIDs, ",")
	}
	if len(o.RecipientSessionIDs) > 0 {
		detail["recipient_session_ids"] = strings.Join(o.RecipientSessionIDs, ",")
	}
	if len(o.RecipientAccountIDs) > 0 {
		detail["recipient_account_ids"] = strings.Join(o.RecipientAccountIDs, ",")
	}
	return detail
}

func appendSkipDetail(detail map[string]any, key string, clientIDs []string) {
	if len(clientIDs) > 0 {
		detail[key] = strings.Join(clientIDs, ",")
	}
}
