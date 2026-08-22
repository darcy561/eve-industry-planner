package soaklib

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	natscore "eve-industry-planner/shared/core/nats"

	natslib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

const soakFanoutCollection = "soakFanout"

type jetStreamPublisher struct {
	nc *natslib.Conn
	js jetstream.JetStream
}

func newJetStreamPublisher() (Publisher, error) {
	nc, js, err := natscore.ConnectJetStream()
	if err != nil {
		return nil, fmt.Errorf("jetstream connect: %w", err)
	}
	if err := natscore.EnsureDocUpdateStream(js); err != nil {
		nc.Close()
		return nil, fmt.Errorf("ensure doc-update stream: %w", err)
	}
	return &jetStreamPublisher{nc: nc, js: js}, nil
}

func (p *jetStreamPublisher) Publish(ctx context.Context, msg DocUpdate) error {
	if p == nil || p.js == nil {
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
	subject := natscore.DocUpdateSubject(tenant, coll, docID)
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
	return natscore.PublishMessage(ctx, p.js, subject, payload, p.nc)
}

func marshalFanoutPayload(subject, coll, docID string, msg DocUpdate) ([]byte, error) {
	body := map[string]any{
		"subject":       subject,
		"collection":    coll,
		"docID":         docID,
		"operationType": "update",
	}
	if id := strings.TrimSpace(msg.AccountID); id != "" {
		body["accountID"] = id
	}
	if id := strings.TrimSpace(msg.CorporationRef); id != "" {
		body["corporationRef"] = id
	}
	if ref := strings.TrimSpace(msg.AllianceRef); ref != "" {
		body["allianceRef"] = ref
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
	if p.nc != nil {
		natscore.Cleanup(p.nc)
		p.nc = nil
	}
	p.js = nil
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
