package server

import (
	"context"
	"slices"
	"strings"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/websocket/server/outgoinglogic"
)

// outboundDeliveryOutcome summarizes fan-out on this websocket replica.
type outboundDeliveryOutcome struct {
	RouteKind string
	OwnerKind string
	// Family names the kind of traffic. Two families can share an audience, so
	// RouteKind alone no longer tells an operator what was being delivered.
	// Subtype narrows it for a family that has kinds; most do not.
	Family  string
	Subtype string
	// Undeliverable says why nothing could carry the message, for the cases that
	// are a defect rather than an empty audience. Kept apart from RouteKind so
	// that field stays one vocabulary an operator can filter on.
	Undeliverable                  string
	RecipientCount                 int
	CandidateCount                 int
	AccountID                      string
	OwnerRef                       string
	SourceClientID                 string
	SourceSessionID                string
	RecipientClientIDs             []string
	RecipientSessionIDs            []string
	RecipientAccountIDs            []string
	SkippedEchoClientIDs           []string
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

func (o *outboundDeliveryOutcome) recordNotConnectedSkip(clientID string) {
	o.SkippedNotConnectedClientIDs = append(o.SkippedNotConnectedClientIDs, clientID)
}

func (o *outboundDeliveryOutcome) recordScopeSkip(clientID string) {
	o.SkippedScopeClientIDs = append(o.SkippedScopeClientIDs, clientID)
}

func (o *outboundDeliveryOutcome) recordSendBufferFull(clientID string) {
	o.SkippedSendBufferFullClientIDs = append(o.SkippedSendBufferFullClientIDs, clientID)
}

// everySkipWasDeliberate reports whether nothing was lost: a candidate held back
// because it caused the change or is rebuilding its state gets the message it
// missed by other means, where one dropped for a full buffer or a stale index
// does not.
//
// The walk records every candidate it does not deliver to, so a fan-out with
// candidates and no recipients has at least one of these lists filled.
func (o *outboundDeliveryOutcome) everySkipWasDeliberate() bool {
	return len(o.SkippedNotConnectedClientIDs) == 0 &&
		len(o.SkippedScopeClientIDs) == 0 &&
		len(o.SkippedSendBufferFullClientIDs) == 0
}

// deliverOutboundDocUpdate converts a NATS doc.update payload and delivers it.
//
// The owner the message states chooses the audience: a readable one addresses
// the connections working in it, and a message stating none addresses whoever
// asked for that document by name — a delete without a preimage, or a producer
// that named no owner.
func (s *Server) deliverOutboundDocUpdate(ctx context.Context, collectionScopedDocID string, messageData []byte, position uint64) outboundDeliveryOutcome {
	decoded, err := outgoinglogic.DecodeOutboundMessage(messageData)
	if err != nil {
		logs.WarnCtx(ctx, "outbound doc update: invalid JSON",
			"doc_id", collectionScopedDocID,
			"error", err.Error())
		return outboundDeliveryOutcome{Undeliverable: "unreadable_message"}
	}

	owner := decoded.Route.Owner
	// Routing metadata names internal identities and the document body carries
	// refs; rewrite once here rather than per recipient, after routing has been
	// decided from the untouched message, so no ref reaches a browser.
	out := Outbound{
		Family: eipnats.ClientMessageDocument,
		Source: Source{
			ClientID:  decoded.Route.SourceClientID,
			SessionID: decoded.Route.SourceSessionID,
		},
		Frame: outgoinglogic.ClientPayload(messageData, owner, s.entityCipher, position),
	}

	switch owner.Kind {
	case models.OwnerAccount, models.OwnerCorporation, models.OwnerAlliance:
		out.Audience = eipnats.AudienceSubscribers
		out.Target = owner
	case "":
	default:
		// A kind the owner model accepts but this service cannot deliver to. Named
		// rather than passed to by-name subscribers unremarked, which would report
		// a near-empty fan-out as an ordinary one.
		logs.WarnCtx(ctx, "outbound doc update: no delivery branch for owner kind",
			"doc_id", collectionScopedDocID,
			"owner_kind", string(owner.Kind))
	}
	if out.Audience == "" {
		out.Audience = audienceDocSubscribers
		out.DocID = collectionScopedDocID
	}

	outcome := s.deliverOutbound(out)
	if out.Target.Kind == models.OwnerAccount {
		s.recordDocUpdateSent(ctx, out.Target.ID, collectionScopedDocID, outcome.RecipientCount)
	}
	return outcome
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
	if o.Undeliverable != "" {
		detail["undeliverable"] = o.Undeliverable
	}
	if o.Family != "" {
		detail["family"] = o.Family
	}
	if o.Subtype != "" {
		detail["subtype"] = o.Subtype
	}
	if o.AccountID != "" {
		detail["account_id"] = o.AccountID
	}
	if o.OwnerKind != "" {
		detail["owner_kind"] = o.OwnerKind
	}
	if o.OwnerRef != "" {
		detail["owner_ref"] = o.OwnerRef
	}
	if o.SourceClientID != "" {
		detail["source_client_id"] = o.SourceClientID
	}
	if o.SourceSessionID != "" {
		detail["source_session_id"] = o.SourceSessionID
	}
	appendSkipDetail(detail, "skipped_echo_suppression_client_ids", o.SkippedEchoClientIDs)
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
