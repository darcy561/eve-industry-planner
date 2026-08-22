package jobdocuments

import (
	"encoding/json"
	"strings"
	"testing"

	"eve-industry-planner/api/apideps"
	"eve-industry-planner/shared/crypto/entityid"
	"eve-industry-planner/shared/jobidentity"
	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func testHandlers(t *testing.T, withCipher bool) *Handlers {
	t.Helper()
	deps := &apideps.Deps{}
	if withCipher {
		c, err := entityid.New([]byte("0123456789abcdef0123456789abcdef"))
		if err != nil {
			t.Fatalf("entityid.New: %v", err)
		}
		deps.EntityCipher = c
	}
	return New(deps)
}

func jobsWithIDs() []models.Job {
	mk := func(id string, corp, char int) models.Job {
		job := models.Job{JobID: id}
		job.Build.Sale.Transactions = []models.Transaction{{TransactionID: 1, CorporationID: corp, CharacterID: char}}
		job.Build.Costs.LinkedJobs = []models.LinkedESIJob{{JobID: 2, CorporationID: corp}}
		return job
	}
	return []models.Job{mk("job-1", 98000001, 91000001), mk("job-2", 98000002, 91000002)}
}

// This is the boundary that keeps raw ids out of Mongo. Every job in the batch
// must be converted, not just the first.
func TestEncryptJobsConvertsTheWholeBatch(t *testing.T) {
	t.Parallel()
	h := testHandlers(t, true)

	jobs := jobsWithIDs()
	if err := h.encryptJobs(jobs); err != nil {
		t.Fatalf("encryptJobs: %v", err)
	}

	for i := range jobs {
		stored, err := bson.MarshalExtJSON(jobs[i], false, false)
		if err != nil {
			t.Fatalf("marshal job %d: %v", i, err)
		}
		body := string(stored)
		for _, raw := range []string{"98000001", "98000002", "91000001", "91000002"} {
			if strings.Contains(body, raw) {
				t.Fatalf("job %d would persist the raw id %s:\n%s", i, raw, body)
			}
		}
		if !strings.Contains(body, "corporation_ref") {
			t.Fatalf("job %d has no corporation_ref after conversion:\n%s", i, body)
		}
		if jobs[i].Protected == nil || jobs[i].Protected.Spec == "" {
			t.Fatalf("job %d was not marked with the field set applied", i)
		}
	}
}

// Without a cipher the write must fail rather than proceed, or the batch reaches
// Mongo with raw ids in it.
func TestEncryptJobsFailsClosedWithoutACipher(t *testing.T) {
	t.Parallel()
	h := testHandlers(t, false)

	jobs := jobsWithIDs()
	if err := h.encryptJobs(jobs); err == nil {
		t.Fatal("expected an error when no cipher is configured")
	}
	if jobs[0].Build.Costs.LinkedJobs[0].CorporationID != 98000001 {
		t.Fatal("a failed conversion must leave the batch untouched rather than half-cleared")
	}
}

func TestDecryptJobsFailsClosedWithoutACipher(t *testing.T) {
	t.Parallel()
	if err := testHandlers(t, false).decryptJobs(jobsWithIDs()); err == nil {
		t.Fatal("expected an error when no cipher is configured")
	}
}

// The read boundary must hand the client its ids back and keep the refs off the
// wire, which is what makes the next write able to re-derive them.
func TestDecryptJobsRestoresIDsAndKeepsRefsOffTheWire(t *testing.T) {
	t.Parallel()
	h := testHandlers(t, true)

	jobs := jobsWithIDs()
	if err := h.encryptJobs(jobs); err != nil {
		t.Fatalf("encryptJobs: %v", err)
	}
	refs := make([]string, 0, len(jobs))
	for i := range jobs {
		for _, target := range jobidentity.Declaration.Targets(&jobs[i]) {
			if target.Ref != nil && *target.Ref != "" {
				refs = append(refs, *target.Ref)
			}
		}
	}
	if len(refs) == 0 {
		t.Fatal("no refs to check")
	}

	if err := h.decryptJobs(jobs); err != nil {
		t.Fatalf("decryptJobs: %v", err)
	}
	served, err := json.Marshal(jobs)
	if err != nil {
		t.Fatalf("marshal response: %v", err)
	}
	body := string(served)

	for _, ref := range refs {
		if strings.Contains(body, ref) {
			t.Fatalf("the response leaks the ref %s", ref)
		}
	}
	for _, want := range []string{"98000001", "98000002", "91000001", "91000002"} {
		if !strings.Contains(body, want) {
			t.Fatalf("the response is missing the id %s the client is owed", want)
		}
	}
}
