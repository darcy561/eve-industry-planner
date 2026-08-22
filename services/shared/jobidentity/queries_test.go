package jobidentity

import (
	"encoding/json"
	"testing"

	eipmongo "eve-industry-planner/shared/mongo"
)

func TestRawIDFilterTargetsTheOnlyPersistedID(t *testing.T) {
	t.Parallel()
	raw, err := json.Marshal(RawIDFilter())
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	want := `{"build.costs.linkedJobs.corporation_id":{"$exists":true}}`
	if string(raw) != want {
		t.Fatalf("filter = %s, want %s", raw, want)
	}
}

// Documents on the current field set must not be selected, so a re-run costs
// nothing and cannot rewrite documents needlessly.
func TestStaleSpecFilterExcludesTheCurrentSpec(t *testing.T) {
	t.Parallel()
	raw, err := json.Marshal(StaleSpecFilter())
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	want := `{"protected.spec":{"$ne":"` + string(Declaration.Spec) + `"}}`
	if string(raw) != want {
		t.Fatalf("filter = %s, want %s", raw, want)
	}
}

func TestAccountWorkFilterCoversBothConditions(t *testing.T) {
	t.Parallel()
	filter := AccountWorkFilter("acct-1")

	if got := filter["_meta.accountID"]; got != "acct-1" {
		t.Fatalf("accountID = %v", got)
	}
	or, ok := filter["$or"].([]any)
	if !ok || len(or) != 2 {
		t.Fatalf("expected raw-id and stale-spec conditions, got %#v", filter["$or"])
	}
}

func TestSupportedCollections(t *testing.T) {
	t.Parallel()
	for _, c := range []string{
		eipmongo.CollectionAccountJobDocuments,
		eipmongo.CollectionAccountArchivedJobs,
		eipmongo.CollectionAccountJobs,
	} {
		if !SupportedCollection(c) {
			t.Fatalf("%s should be sweepable", c)
		}
	}
	if SupportedCollection(eipmongo.CollectionAccounts) {
		t.Fatal("users carry no job identity and must be rejected")
	}
	if SupportedCollection("") {
		t.Fatal("an empty collection name must be rejected")
	}
}
