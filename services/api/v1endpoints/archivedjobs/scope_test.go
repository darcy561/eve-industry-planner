package archivedjobs

import (
	"testing"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// The scope filters on the same predicate the rebuild uses, so the list and the
// statistics cannot disagree about ownership.
func TestAccountScopeFiltersOnAccountOwnership(t *testing.T) {
	scope := archiveScope{
		OwnerID:     "account-1",
		ownerFilter: eipmongo.ArchivedJobAccountFilter,
	}
	filter := scope.filter()
	if got := filter["_meta.accountID"]; got != "account-1" {
		t.Fatalf("filter = %v, want ownership by _meta.accountID", filter)
	}
}

// A shared map would let one caller's jobID narrow every later query.
func TestFilterDoesNotLeakBetweenCalls(t *testing.T) {
	scope := archiveScope{
		OwnerID:     "account-1",
		ownerFilter: eipmongo.ArchivedJobAccountFilter,
	}
	first := scope.filter()
	first["jobID"] = bson.M{"$in": []string{"job-1"}}

	second := scope.filter()
	if _, leaked := second["jobID"]; leaked {
		t.Fatalf("filter leaked a caller's narrowing: %v", second)
	}
}

// The scope builds the id, so a different keying scheme changes no callers.
func TestScopeBuildsStatsDocumentID(t *testing.T) {
	scope := archiveScope{
		OwnerID: "account-1",
		statsDocumentID: func(ownerID, jobID string) string {
			return eipmongo.ArchivedJobStatsDocumentID(models.AccountOwner(ownerID), jobID)
		},
	}
	if got := scope.statsID("job-1"); got != "account:account-1|job-1" {
		t.Fatalf("statsID = %q", got)
	}
}

// Report what is missing rather than returning a nil to dereference.
func TestScopeWithoutCollectionsReportsWhatIsMissing(t *testing.T) {
	var scope archiveScope
	if _, err := scope.jobsCollection(); err == nil {
		t.Fatal("expected an error naming the missing archive collection")
	}
	if _, err := scope.statsCollection(); err == nil {
		t.Fatal("expected an error naming the missing statistics collection")
	}
}

// ESI ownership is per account, so a scope without linked sets must skip the
// re-link rather than run it against the wrong owner.
func TestOnlyTheAccountArchiveRelinksESI(t *testing.T) {
	account, err := accountArchiveScope(&eipmongo.Mongo{}, "account-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !account.relinksESI {
		t.Fatal("the account archive reclaims ESI ids")
	}

	other := archiveScope{OwnerID: "corp-1", ownerFilter: eipmongo.ArchivedJobAccountFilter}
	if other.relinksESI {
		t.Fatal("an archive with no linked sets must not attempt a re-link")
	}
}

func TestAccountScopeRequiresItsInputs(t *testing.T) {
	if _, err := accountArchiveScope(nil, "account-1"); err == nil {
		t.Fatal("expected an error without a mongo handle")
	}
	if _, err := accountArchiveScope(&eipmongo.Mongo{}, ""); err == nil {
		t.Fatal("expected an error without an owner")
	}
}
