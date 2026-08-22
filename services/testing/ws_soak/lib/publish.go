package soaklib

import (
	"context"
	"fmt"
	"time"
)

// PublishMode selects how fan-out soaks inject doc.update traffic.
type PublishMode string

const (
	PublishNone      PublishMode = "none"      // placement-only (hold/limits/pressure)
	PublishJetStream PublishMode = "jetstream" // synthetic JetStream → WS
	PublishMongo     PublishMode = "mongo"     // Mongo → core changestream → NATS → WS
)

// DocUpdate is a stamped live-update used by fan-out publishers and receivers.
type DocUpdate struct {
	TenantString string
	Collection   string
	DocID        string
	Payload      []byte
	SentAt       time.Time

	// Routing fields (ChangeStream-shaped). Account takes precedence over corp/alliance.
	AccountID           string
	CorporationRef      string
	AllianceID          string
	ScopeAccountIDs     []string
	ScopeCorporationIDs []string
}

// Publisher injects doc.update traffic for fan-out soaks.
type Publisher interface {
	Publish(ctx context.Context, msg DocUpdate) error
	Close() error
}

// NewPublisher returns a publisher for mode.
func NewPublisher(mode PublishMode) (Publisher, error) {
	switch mode {
	case PublishNone, "":
		return noopPublisher{}, nil
	case PublishJetStream:
		return newJetStreamPublisher()
	case PublishMongo:
		return newMongoPublisher()
	default:
		return nil, fmt.Errorf("unknown publish mode %q (want none|jetstream|mongo)", mode)
	}
}

type noopPublisher struct{}

func (noopPublisher) Publish(context.Context, DocUpdate) error { return nil }
func (noopPublisher) Close() error                             { return nil }
