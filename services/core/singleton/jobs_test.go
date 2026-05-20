package singleton

import (
	"strings"
	"testing"

	"eve-industry-planner/shared/core/documentlock"
)

// TestAllJobs_CatalogIsValid is a guardrail on the production catalog.
// Any new singleton Job added to `allJobs` is automatically checked for:
//   - non-empty Name + LeaseKey + Run (avoids a runtime startup error),
//   - globally unique LeaseKey (two jobs sharing a key would unintentionally
//     elect leaders for each other),
//   - `lease:` prefix on the lease key (convention).
//
// We pass nil for *shared.ServiceClients because the catalog's job
// constructors only consume the clients lazily inside their Run closures.
// If a future constructor starts touching clients at build time it'll need
// a real bundle; that's the right time to revisit this test.
func TestAllJobs_CatalogIsValid(t *testing.T) {
	t.Parallel()

	jobs := allJobs(nil)
	if len(jobs) == 0 {
		t.Fatalf("expected at least one Job in the catalog, got 0")
	}

	seen := map[string]string{}
	for _, j := range jobs {
		if err := j.validate(); err != nil {
			t.Errorf("Job %q failed validation: %v", j.Name, err)
		}
		if !strings.HasPrefix(j.LeaseKey, "lease:") {
			t.Errorf("Job %q lease key %q must start with %q",
				j.Name, j.LeaseKey, "lease:")
		}
		if prev, dup := seen[j.LeaseKey]; dup {
			t.Errorf("lease key %q reused by jobs %q and %q",
				j.LeaseKey, prev, j.Name)
		}
		seen[j.LeaseKey] = j.Name
	}
}

// TestDoclockExpirySubscriberJob_Wiring asserts the exported constructor
// produces a Job that StartService would accept (name, key, Run all
// populated). The full lifecycle (lease + run) is covered by the
// integration-style tests in service_test.go.
func TestDoclockExpirySubscriberJob_Wiring(t *testing.T) {
	t.Parallel()

	job := DoclockExpirySubscriberJob(documentlock.Deps{})
	if err := job.validate(); err != nil {
		t.Fatalf("doc-lock expiry subscriber job invalid: %v", err)
	}
	if job.LeaseKey != DoclockExpirySubscriberLeaseKey {
		t.Fatalf("LeaseKey=%q, want %q", job.LeaseKey, DoclockExpirySubscriberLeaseKey)
	}
}
