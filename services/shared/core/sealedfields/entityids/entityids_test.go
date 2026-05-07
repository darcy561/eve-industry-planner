package entityids

import (
	"encoding/json"
	"testing"

	corecrypto "eve-industry-planner/shared/core/crypto"
	"eve-industry-planner/shared/core/sealedfields"
	"eve-industry-planner/shared/shared/models"
)

func TestBuildApplyAndStrip(t *testing.T) {
	job := models.Job{
		Build: models.JobBuild{
			Costs: models.JobCosts{
				LinkedJobs: []models.LinkedESIJob{
					{JobID: 10, CorporationID: 999, CharacterID: 111},
				},
			},
			Sale: models.JobSale{
				MarketOrders: []models.MarketOrder{
					{OrderID: 1, CorporationID: 222, CharacterID: 333},
				},
				Transactions: []models.Transaction{
					{TransactionID: 1001, CorporationID: 444, CharacterID: 555},
				},
				BrokersFee: []models.BrokerFee{
					{OrderID: 1},
				},
			},
		},
	}

	plaintext, err := Build(job.Build.Sale.MarketOrders, job.Build.Sale.Transactions, job.Build.Costs.LinkedJobs)
	if err != nil {
		t.Fatalf("build payload: %v", err)
	}

	Strip(&job)
	if job.Build.Costs.LinkedJobs[0].CorporationID != 0 {
		t.Fatal("expected linked job corp to be stripped")
	}

	if err := Apply(plaintext, &job); err != nil {
		t.Fatalf("apply payload: %v", err)
	}

	if job.Build.Sale.Transactions[0].CorporationID != 444 || job.Build.Sale.Transactions[0].CharacterID != 555 {
		t.Fatalf("transaction identity not applied: %+v", job.Build.Sale.Transactions[0])
	}
	if job.Build.Sale.MarketOrders[0].CorporationID != 222 || job.Build.Sale.MarketOrders[0].CharacterID != 333 {
		t.Fatalf("order identity not applied: %+v", job.Build.Sale.MarketOrders[0])
	}
	if job.Build.Costs.LinkedJobs[0].CorporationID != 999 || job.Build.Costs.LinkedJobs[0].CharacterID != 111 {
		t.Fatalf("linked job identity not applied: %+v", job.Build.Costs.LinkedJobs[0])
	}
	// Broker fee inherits identity from orderID match.
	if job.Build.Sale.BrokersFee[0].CorporationID != 222 || job.Build.Sale.BrokersFee[0].CharacterID != 333 {
		t.Fatalf("broker fee identity not inherited from order: %+v", job.Build.Sale.BrokersFee[0])
	}
}

func TestJobIdentitySealer_SealAndStrip(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i + 1)
	}
	kr, err := corecrypto.NewKeyring("v1", key, nil)
	if err != nil {
		t.Fatalf("new keyring: %v", err)
	}
	sealer := NewJobIdentitySealer(kr)

	job := &models.Job{
		Build: models.JobBuild{
			Costs: models.JobCosts{
				LinkedJobs: []models.LinkedESIJob{{JobID: 10, CorporationID: 999}},
			},
			Sale: models.JobSale{
				Transactions: []models.Transaction{{TransactionID: 1001, CorporationID: 444}},
			},
		},
	}
	if err := sealer.SealJobIdentity(job); err != nil {
		t.Fatalf("SealJobIdentity: %v", err)
	}
	if job.Sealed == nil {
		t.Fatal("expected sealed envelope to be set")
	}
	if job.Build.Costs.LinkedJobs[0].CorporationID != 0 {
		t.Fatal("expected linked job corporation_id stripped")
	}
	if job.Build.Sale.Transactions[0].CorporationID != 0 {
		t.Fatal("expected transaction corporation_id stripped")
	}
	plaintext, err := sealedfields.Open(kr, job.Sealed)
	if err != nil {
		t.Fatalf("open sealed: %v", err)
	}
	if err := Apply(plaintext, job); err != nil {
		t.Fatalf("apply: %v", err)
	}
	if job.Build.Costs.LinkedJobs[0].CorporationID != 999 {
		t.Fatal("expected linked job corporation_id restored from sealed payload")
	}
}

func TestCorpMapsFromPlaintext(t *testing.T) {
	raw, err := json.Marshal(map[string]any{
		"tx": map[string]any{
			"1001": map[string]any{"corp": 44},
		},
		"ord": map[string]any{
			"55": map[string]any{"corp": 66},
		},
		"ind": map[string]any{
			"77": map[string]any{"corp": 88},
		},
	})
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	txMap, err := TransactionCorporationsFromPlaintext(raw)
	if err != nil {
		t.Fatalf("TransactionCorporationsFromPlaintext: %v", err)
	}
	if txMap[1001] != 44 {
		t.Fatalf("unexpected tx map value: %v", txMap)
	}

	orderMap, err := OrderCorporationsFromPlaintext(raw)
	if err != nil {
		t.Fatalf("OrderCorporationsFromPlaintext: %v", err)
	}
	if orderMap[55] != 66 {
		t.Fatalf("unexpected order map value: %v", orderMap)
	}

	linkedMap, err := LinkedJobCorporationsFromPlaintext(raw)
	if err != nil {
		t.Fatalf("LinkedJobCorporationsFromPlaintext: %v", err)
	}
	if linkedMap[77] != 88 {
		t.Fatalf("unexpected linked map value: %v", linkedMap)
	}
}
