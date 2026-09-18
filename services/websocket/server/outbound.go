package server

import (
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/websocket/server/outgoinglogic"
)

// Source names the connection a message came from, so it is not told about its
// own work.
//
// Two tiers because a browser write names the tab that made it and a server-side
// one names nothing: with a client id only that tab is skipped and its siblings
// are delivered to, and without one the whole session is. A zero Source
// suppresses nobody.
type Source struct {
	ClientID  string
	SessionID string
}

func (s Source) suppresses() bool { return s.ClientID != "" || s.SessionID != "" }

// audienceDocSubscribers reaches the clients that asked for one document by
// name, which is where a change stating no readable owner goes.
//
// An adapter chooses it; no producer can address it. A message arriving on the
// wire keeps only an audience a producer is allowed to name — see
// audienceOutbound — so publishing this string reaches nobody.
const audienceDocSubscribers = eipnats.Audience("doc_subscribers")

// Outbound is one message to deliver, whatever subject it arrived on.
//
// Every subscription converts what it received into this, which is what lets one
// walk deliver all of them. Audience and Target say who receives it; Family
// selects the policy below and never the recipients — a family deciding its own
// audience is the coupling that broke when a second family wanted an audience the
// first already had.
type Outbound struct {
	Family   string
	Subtype  string
	Audience eipnats.Audience
	Target   models.Owner
	// DocID names the document for an audience that reads a by-name subscription
	// rather than an owner.
	DocID  string
	Source Source
	// Frame is what the socket is given, built by the adapter that produced this.
	// Delivery never reads it.
	Frame []byte
}

// deliverableFamilies is every message family this service can deliver. A family
// absent from it is reported rather than fanned out on a default, because a
// family nobody wrote down is not one this build knows how to address.
var deliverableFamilies = map[string]struct{}{
	eipnats.ClientMessageNotification: {},
	eipnats.ClientMessageStaticData:   {},
	eipnats.ClientMessageDocument:     {},
	eipnats.ClientMessageDocumentLock: {},
}

// deliverOutbound sends one message to the clients its audience names.
//
// The audience picks the candidate set, the owner check confirms each candidate
// still belongs to it, and the policy adds whatever else that family needs.
func (s *Server) deliverOutbound(out Outbound) outboundDeliveryOutcome {
	outcome := outboundDeliveryOutcome{
		RouteKind:       string(out.Audience),
		Family:          out.Family,
		Subtype:         out.Subtype,
		OwnerKind:       string(out.Target.Kind),
		OwnerRef:        out.Target.ID,
		SourceClientID:  out.Source.ClientID,
		SourceSessionID: out.Source.SessionID,
	}
	if out.Target.Kind == models.OwnerAccount {
		outcome.AccountID = out.Target.ID
	}

	if _, known := deliverableFamilies[out.Family]; !known {
		outcome.Undeliverable = "unknown_family"
		return outcome
	}
	if len(out.Frame) == 0 {
		return outcome
	}

	if out.Audience == eipnats.AudienceSubscribers && out.Target.ID == "" {
		// An owner kind with no id addresses no pool. Reported rather than left to
		// read as an audience nobody was connected for, which is an ordinary
		// outcome and this is not.
		outcome.Undeliverable = "unaddressable_target"
		return outcome
	}

	clientIDs, addressable := s.candidatesFor(out)
	if !addressable {
		outcome.Undeliverable = "unknown_audience"
		return outcome
	}
	outcome.CandidateCount = len(clientIDs)
	if len(clientIDs) == 0 {
		return outcome
	}

	s.ClientsMu.RLock()
	defer s.ClientsMu.RUnlock()
	for _, clientID := range clientIDs {
		client, ok := s.Clients[clientID]
		if !ok {
			outcome.recordNotConnectedSkip(clientID)
			continue
		}
		if !s.clientHoldsTarget(client, out) {
			outcome.recordScopeSkip(clientID)
			continue
		}
		if out.Source.suppresses() &&
			outgoinglogic.ShouldSuppressRecipient(out.Source.SessionID, out.Source.ClientID, client.SessionID, clientID) {
			outcome.recordEchoSkip(clientID)
			continue
		}
		if outgoinglogic.TrySendNonBlocking(client.Send, out.Frame) {
			outcome.RecipientCount++
			outcome.recordRecipient(clientID, client)
		} else {
			outcome.recordSendBufferFull(clientID)
			logs.WarnCtx(client.LogContext(), "client send buffer full, dropping message",
				"client_id", clientID,
				"family", out.Family,
				"audience", string(out.Audience))
		}
	}
	return outcome
}

// candidatesFor snapshots the client ids an audience names, reporting whether
// this build can address that audience at all.
func (s *Server) candidatesFor(out Outbound) (clientIDs []string, addressable bool) {
	switch out.Audience {
	case eipnats.AudienceEveryone:
		s.ClientsMu.RLock()
		defer s.ClientsMu.RUnlock()
		ids := make([]string, 0, len(s.Clients))
		for id := range s.Clients {
			ids = append(ids, id)
		}
		return ids, true

	case eipnats.AudienceSubscribers:
		// An account's own key is deliberately absent from the owner pools, so its
		// tabs are found through the connection index instead — see pooledScopes.
		if out.Target.Kind == models.OwnerAccount {
			return s.connectionsForAccount(out.Target.ID), true
		}
		return s.clientsForOwner(out.Target), true

	case audienceDocSubscribers:
		s.explicitDocSubMu.RLock()
		defer s.explicitDocSubMu.RUnlock()
		return copyClientIDSet(s.explicitDocSubscribers[out.DocID]), true

	default:
		return nil, false
	}
}

// clientHoldsTarget reports whether a candidate still belongs to the owner the
// message addresses, which the index alone is not authority for: the pool and a
// client's scopes are written at different moments.
func (s *Server) clientHoldsTarget(client *Client, out Outbound) bool {
	switch out.Audience {
	case eipnats.AudienceEveryone:
		return true
	case eipnats.AudienceSubscribers:
		if out.Target.Kind == models.OwnerAccount {
			return outgoinglogic.ClientBelongsToAccount(out.Target.ID, client.AccountID)
		}
		return s.clientScopesSnapshot(client).Has(out.Target)
	case audienceDocSubscribers:
		return out.DocID != "" && client.explicitDocIDs[out.DocID]
	default:
		return false
	}
}

// connectionsForAccount snapshots an account's live connection ids.
func (s *Server) connectionsForAccount(accountID string) []string {
	if accountID == "" {
		return nil
	}
	s.userConnMu.RLock()
	defer s.userConnMu.RUnlock()
	return copyClientIDSet(s.userConnections[accountID])
}
