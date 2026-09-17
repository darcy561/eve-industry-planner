package mongo

import (
	"testing"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestOwnerScopedDocumentIDCarriesTheOwner(t *testing.T) {
	t.Parallel()

	got := OwnerScopedDocumentID(models.AccountOwner("acct-1"), "job-1")
	if got != "account:acct-1|job-1" {
		t.Fatalf("id = %q, want account:acct-1|job-1", got)
	}
}

// The same bare id under two planners must produce two documents, which is the
// whole reason the owner is in the id.
func TestOwnerScopedDocumentIDSeparatesTwoOwners(t *testing.T) {
	t.Parallel()

	mine := OwnerScopedDocumentID(models.AccountOwner("acct-1"), "job-1")
	theirs := OwnerScopedDocumentID(models.CorporationOwner("corp_ref"), "job-1")
	if mine == theirs {
		t.Fatalf("two owners produced one id: %q", mine)
	}
}

// An id that cannot be scoped is empty rather than partial: a filter built from
// half an id would match the wrong document.
func TestOwnerScopedDocumentIDRefusesIncompleteInput(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name  string
		owner models.Owner
		id    string
	}{
		{"no owner", models.Owner{}, "job-1"},
		{"no id", models.AccountOwner("acct-1"), ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := OwnerScopedDocumentID(tc.owner, tc.id); got != "" {
				t.Fatalf("id = %q, want empty", got)
			}
		})
	}
}

func TestOwnerScopedDocumentIDsDropsWhatItCannotScope(t *testing.T) {
	t.Parallel()

	got := OwnerScopedDocumentIDs(models.AccountOwner("acct-1"), []string{"job-1", "", "job-2"})
	want := []string{"account:acct-1|job-1", "account:acct-1|job-2"}
	if len(got) != len(want) {
		t.Fatalf("ids = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("ids = %v, want %v", got, want)
		}
	}
}

func TestBareDocumentIDIsWhatAClientKnows(t *testing.T) {
	t.Parallel()

	if got := BareDocumentID("account:acct-1|job-1"); got != "job-1" {
		t.Fatalf("bare id = %q, want job-1", got)
	}
}

// An account's own singleton documents are keyed by the account id alone, so an
// id with no owner is already bare.
func TestBareDocumentIDLeavesAnUnscopedIDAlone(t *testing.T) {
	t.Parallel()

	if got := BareDocumentID("acct-1"); got != "acct-1" {
		t.Fatalf("bare id = %q, want acct-1", got)
	}
}

// A job id containing the separator still round-trips: only the first one
// divides the owner from the id.
func TestDocumentIDRoundTripsAnIDContainingTheSeparator(t *testing.T) {
	t.Parallel()
	owner := models.AccountOwner("acct-1")

	stored := OwnerScopedDocumentID(owner, "job|with|pipes")
	if got := BareDocumentID(stored); got != "job|with|pipes" {
		t.Fatalf("bare id = %q, want job|with|pipes", got)
	}
	got, err := OwnerFromDocumentID(stored)
	if err != nil {
		t.Fatalf("OwnerFromDocumentID: %v", err)
	}
	if got != owner {
		t.Fatalf("owner = %v, want %v", got, owner)
	}
}

func TestOwnerFromDocumentIDRefusesAnIDWithNoOwner(t *testing.T) {
	t.Parallel()

	if _, err := OwnerFromDocumentID("job-1"); err == nil {
		t.Fatal("an id carrying no owner was accepted")
	}
}

// An owner kind nothing can read is refused rather than carried, the way
// ParseOwnerKey refuses it.
func TestOwnerFromDocumentIDRefusesAnUnknownKind(t *testing.T) {
	t.Parallel()

	if _, err := OwnerFromDocumentID("wizard:merlin|job-1"); err == nil {
		t.Fatal("an unknown owner kind was accepted")
	}
}

// Mongo refuses $set of a subdocument alongside $inc of a path inside it, so
// `_meta` must be set field by field. Setting it whole would also reset the
// counter to whatever the caller's struct held.
func TestSetDocumentWithRevisionSetsMetaByPath(t *testing.T) {
	t.Parallel()

	job := models.Job{
		JobID: "job-1",
		MetaData: models.JobMetaData{
			MetaData: models.MetaData{Owner: models.AccountOwner("acct-1")},
		},
	}

	update, err := SetDocumentWithRevision(job, nil)
	if err != nil {
		t.Fatalf("SetDocumentWithRevision: %v", err)
	}

	set, ok := update["$set"].(bson.M)
	if !ok {
		t.Fatalf("$set = %T, want bson.M", update["$set"])
	}
	if _, whole := set["_meta"]; whole {
		t.Error("_meta was set whole, which conflicts with the version increment")
	}
	if _, byPath := set["_meta.owner"]; !byPath {
		t.Error("the owner was not set by path")
	}
	if _, versioned := set[FieldMetaRevision]; versioned {
		t.Error("the version was set as well as incremented")
	}

	inc, ok := update["$inc"].(bson.M)
	if !ok || inc[FieldMetaRevision] != 1 {
		t.Errorf("$inc = %v, want the version incremented by one", update["$inc"])
	}
}

// A write that also clears retired fields keeps its $unset.
func TestSetDocumentWithRevisionKeepsTheUnset(t *testing.T) {
	t.Parallel()

	update, err := SetDocumentWithRevision(models.Job{JobID: "job-1"}, bson.M{"archived": ""})
	if err != nil {
		t.Fatalf("SetDocumentWithRevision: %v", err)
	}
	unset, ok := update["$unset"].(bson.M)
	if !ok {
		t.Fatalf("$unset = %T, want bson.M", update["$unset"])
	}
	if _, cleared := unset["archived"]; !cleared {
		t.Error("the unset was dropped")
	}
}

// No retired fields means no $unset key at all, rather than an empty one.
func TestSetDocumentWithRevisionOmitsAnEmptyUnset(t *testing.T) {
	t.Parallel()

	update, err := SetDocumentWithRevision(models.Job{JobID: "job-1"}, nil)
	if err != nil {
		t.Fatalf("SetDocumentWithRevision: %v", err)
	}
	if _, present := update["$unset"]; present {
		t.Error("an empty $unset was included")
	}
}

// The owner a read is scoped to is the loader's, never the caller's filter.
// mergeFilters lets `extra` win, so applying the owner second is what stops a
// filter naming another owner from widening the read.
func TestMergeFiltersLetsTheScopeWin(t *testing.T) {
	t.Parallel()

	caller := bson.M{
		FieldMetaOwnerKind: models.OwnerAccount,
		FieldMetaOwnerID:   "someone-else",
		"displayOnPlanner": true,
	}
	owner := models.CorporationOwner("corp_ref")

	scoped := mergeFilters(caller, bson.M{
		FieldMetaOwnerKind: owner.Kind,
		FieldMetaOwnerID:   owner.ID,
	})

	if scoped[FieldMetaOwnerKind] != owner.Kind {
		t.Errorf("kind = %v, want %v", scoped[FieldMetaOwnerKind], owner.Kind)
	}
	if scoped[FieldMetaOwnerID] != owner.ID {
		t.Errorf("id = %v, want %v", scoped[FieldMetaOwnerID], owner.ID)
	}
	if scoped["displayOnPlanner"] != true {
		t.Error("the caller's own predicate was dropped")
	}
}
