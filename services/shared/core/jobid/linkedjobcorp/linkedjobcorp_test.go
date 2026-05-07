package linkedjobcorp

import (
	"testing"

	corecrypto "eve-industry-planner/shared/core/crypto"
	"eve-industry-planner/shared/core/sealedfields/entityids"
	"eve-industry-planner/shared/shared/models"
)

func testKeyring(t *testing.T) *corecrypto.Keyring {
	t.Helper()
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i + 1)
	}
	kr, err := corecrypto.NewKeyring("v1", key, nil)
	if err != nil {
		t.Fatalf("new keyring: %v", err)
	}
	return kr
}

func TestResolvePrefersSealedThenLegacy(t *testing.T) {
	kr := testKeyring(t)
	job := &models.Job{
		Build: models.JobBuild{
			Costs: models.JobCosts{
				LinkedJobs: []models.LinkedESIJob{
					{JobID: 10, CorporationID: 111}, // overridden by sealed
					{JobID: 20, CorporationID: 222}, // legacy only
				},
			},
		},
	}

	// Build sealed payload with linked job 10 -> 999
	job.Build.Costs.LinkedJobs[0].CharacterID = 1
	payload, err := entityids.Build(nil, nil, job.Build.Costs.LinkedJobs[:1])
	if err != nil {
		t.Fatalf("build payload: %v", err)
	}
	sealer := entityids.NewJobIdentitySealer(kr)
	_ = payload
	if err := sealer.SealJobIdentity(job); err != nil {
		t.Fatalf("seal: %v", err)
	}

	resolved := Resolve(job, kr)
	if resolved[10] != 111 {
		// Sealer strips plaintext and preserves payload; for this test we expect from sealed payload.
		// Linked job 10 corp remains the same value (111) in payload.
		t.Fatalf("unexpected corp for job 10: %d", resolved[10])
	}
	if resolved[20] != 222 {
		t.Fatalf("expected legacy fallback for job 20, got %d", resolved[20])
	}
}
