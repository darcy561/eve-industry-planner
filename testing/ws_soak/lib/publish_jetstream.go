package soaklib

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	eipnats "eve-industry-planner/shared/nats"
)

const soakFanoutCollection = "soakFanout"

type jetStreamPublisher struct {
	nats *eipnats.NATS
}

func newJetStreamPublisher() (Publisher, error) {
	handle, err := eipnats.Open(context.Background())
	if err != nil {
		return nil, fmt.Errorf("jetstream connect: %w", err)
	}
	if _, err := handle.DocUpdate.Ensure(context.Background()); err != nil {
		handle.Close()
		return nil, fmt.Errorf("ensure doc-update stream: %w", err)
	}
	return &jetStreamPublisher{nats: handle}, nil
}

func (p *jetStreamPublisher) Publish(ctx context.Context, msg DocUpdate) error {
	if p == nil || p.nats == nil {
		return fmt.Errorf("jetstream publisher closed")
	}
	tenant := strings.TrimSpace(msg.TenantString)
	coll := strings.TrimSpace(msg.Collection)
	if coll == "" {
		coll = soakFanoutCollection
	}
	docID := strings.TrimSpace(msg.DocID)
	if tenant == "" || docID == "" {
		return fmt.Errorf("jetstream publish: tenant and docID required")
	}
	subject := eipnats.DocUpdateSubject(tenant, coll, docID)
	if subject == "" {
		return fmt.Errorf("jetstream publish: empty subject")
	}
	payload := msg.Payload
	if len(payload) == 0 {
		var err error
		payload, err = marshalFanoutPayload(subject, coll, docID, msg)
		if err != nil {
			return err
		}
	}
	return p.nats.Publish(ctx, subject, payload)
}

func marshalFanoutPayload(subject, coll, docID string, msg DocUpdate) ([]byte, error) {
	body := map[string]any{
		"subject":       subject,
		"collection":    coll,
		"docID":         docID,
		"operationType": "update",
	}
	// One owner key, as the watcher publishes it. Account takes precedence, then
	// corporation, then alliance — the order the harness's own topology assigns.
	if owner := msg.owner(); !owner.IsZero() {
		body["ownerKey"] = owner.Key()
	}
	scopes := map[string]any{}
	if len(msg.ScopeAccountIDs) > 0 {
		scopes["accountIDs"] = append([]string{}, msg.ScopeAccountIDs...)
	}
	if len(msg.ScopeCorporationRefs) > 0 {
		scopes["corporationRefs"] = append([]string{}, msg.ScopeCorporationRefs...)
	}
	if len(scopes) > 0 {
		body["scopes"] = scopes
	}
	return json.Marshal(body)
}

func (p *jetStreamPublisher) Close() error {
	if p == nil {
		return nil
	}
	if p.nats != nil {
		p.nats.Close()
		p.nats = nil
	}
	p.nats = nil
	return nil
}

func docUpdateFromJob(job fanoutJob) DocUpdate {
	coll := job.Collection
	if coll == "" {
		coll = soakFanoutCollection
	}
	return DocUpdate{
		TenantString:         job.TenantString,
		Collection:           coll,
		DocID:                job.DocID,
		AccountID:            job.AccountID,
		CorporationRef:       job.CorporationRef,
		AllianceRef:          job.AllianceRef,
		ScopeAccountIDs:      job.ScopeAccountIDs,
		ScopeCorporationRefs: job.ScopeCorporationRefs,
	}
}
