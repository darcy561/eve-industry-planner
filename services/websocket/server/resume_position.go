package server

import (
	"context"
	"errors"
	"fmt"

	"eve-industry-planner/shared/models"
	eipnats "eve-industry-planner/shared/nats"

	"github.com/nats-io/nats.go/jetstream"
)

// lastSequenceLookup answers where a subject's most recent message sits in the
// stream, and reports whether there is one at all.
type lastSequenceLookup func(ctx context.Context, subject string) (sequence uint64, found bool, err error)

// resumeTenants is every owner whose changes this connection would have been
// delivered: the account's own, and whatever its session grants reach.
//
// Read from the connection rather than taken from the client, because it is the
// answer to "what could I have missed" and a client naming its own list would be
// asking about planners it may not reach.
func resumeTenants(client *Client) []string {
	if client == nil || client.AccountID == "" {
		return nil
	}
	tenants := []string{models.AccountOwner(client.AccountID).Key()}
	for _, key := range client.Scopes {
		if key != "" && key != tenants[0] {
			tenants = append(tenants, key)
		}
	}
	return tenants
}

// resumeMissedChanges reports whether anything the connection would have been
// delivered was published after the position it last applied.
//
// Asked per tenant rather than of the stream as a whole: lock events share the
// stream with document changes, so a stream-wide comparison would answer "you
// missed something" every time anybody anywhere took a lock.
//
// Every uncertain answer is "you missed something". A resume that wrongly says a
// client is current leaves it holding documents that have moved on, and nothing
// afterwards corrects it; one that wrongly says it is behind costs two reads.
func resumeMissedChanges(ctx context.Context, position uint64, tenants []string, lastSequence lastSequenceLookup) (bool, error) {
	if position == 0 || lastSequence == nil {
		return true, nil
	}
	for _, tenant := range tenants {
		subject := eipnats.DocUpdateFilterForTenant(tenant)
		if subject == "" {
			continue
		}
		sequence, found, err := lastSequence(ctx, subject)
		if err != nil {
			return true, fmt.Errorf("last sequence for %s: %w", subject, err)
		}
		if found && sequence > position {
			return true, nil
		}
	}
	return false, nil
}

// streamLastSequence reads the fan-out stream, or reports that it cannot.
func (s *Server) streamLastSequence() lastSequenceLookup {
	s.fanoutFilterMu.Lock()
	stream := s.fanoutStream
	s.fanoutFilterMu.Unlock()
	if stream == nil {
		return nil
	}
	return func(ctx context.Context, subject string) (uint64, bool, error) {
		msg, err := stream.GetLastMsgForSubject(ctx, subject)
		if err != nil {
			if errors.Is(err, jetstream.ErrMsgNotFound) {
				return 0, false, nil
			}
			return 0, false, err
		}
		return msg.Sequence, true, nil
	}
}
