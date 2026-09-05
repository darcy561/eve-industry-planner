package soaklib

import (
	"context"
	"eve-industry-planner/shared/models"
	"fmt"
	"strings"
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
	AccountID            string
	CorporationRef       string
	AllianceRef          string
	ScopeAccountIDs      []string
	ScopeCorporationRefs []string
}

// owner is the document owner these routing fields describe, in the precedence
// the harness assigns. The wire carries one owner key, so the three fields are
// resolved here rather than published side by side.
func (d DocUpdate) owner() models.Owner {
	switch {
	case strings.TrimSpace(d.AccountID) != "":
		return models.AccountOwner(d.AccountID)
	case strings.TrimSpace(d.CorporationRef) != "":
		return models.Owner{Kind: models.OwnerCorporation, ID: strings.TrimSpace(d.CorporationRef)}
	case strings.TrimSpace(d.AllianceRef) != "":
		return models.Owner{Kind: models.OwnerAlliance, ID: strings.TrimSpace(d.AllianceRef)}
	}
	return models.Owner{}
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
