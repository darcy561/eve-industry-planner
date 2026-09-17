package mongo

import (
	"slices"
	"strings"
	"testing"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// The rewrite's selector is the id itself, which is what makes re-running it
// safe and its remaining work countable.
func TestNeedsOwnerScopedIDReadsTheIDItself(t *testing.T) {
	t.Parallel()

	for name, tc := range map[string]struct {
		id   string
		want bool
	}{
		"a bare job id":           {id: "job-1", want: true},
		"already scoped":          {id: "account:acct-1|job-1", want: false},
		"scoped to a corporation": {id: "corporation:corp_ref|job-1", want: false},
		"an owner kind we refuse": {id: "wizard:merlin|job-1", want: true},
		"empty":                   {id: "", want: true},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if got := NeedsOwnerScopedID(tc.id); got != tc.want {
				t.Fatalf("NeedsOwnerScopedID(%q) = %v, want %v", tc.id, got, tc.want)
			}
		})
	}
}

// A document already moved reports no new id, so a re-run writes nothing.
func TestRewrittenDocumentIDIsEmptyForAMovedDocument(t *testing.T) {
	t.Parallel()
	owner := models.AccountOwner("acct-1")

	if got := RewrittenDocumentID(owner, "account:acct-1|job-1"); got != "" {
		t.Fatalf("RewrittenDocumentID = %q, want empty for a document already moved", got)
	}
	if got := RewrittenDocumentID(owner, "job-1"); got != "account:acct-1|job-1" {
		t.Fatalf("RewrittenDocumentID = %q, want the scoped id", got)
	}
}

// The account's own singleton documents keep bare ids: their _id is the account
// id, which already names the only owner they can have.
func TestOwnerScopedIDCollectionsExcludeTheAccountSingletons(t *testing.T) {
	t.Parallel()

	for _, singleton := range AccountOwnedCollections() {
		if slices.Contains(OwnerScopedIDCollections(), singleton) {
			t.Errorf("%s holds account singletons and must keep bare ids", singleton)
		}
	}
}

// Every collection that takes owner-scoped ids is one a planner holds, so the
// two lists cannot drift into disagreeing about what a planner owns.
func TestOwnerScopedIDCollectionsArePlannerHeld(t *testing.T) {
	t.Parallel()

	planner := PlannerHeldCollections()
	for _, name := range OwnerScopedIDCollections() {
		if name == CollectionArchivedJobs || name == CollectionGroupTemplatePayloads {
			// Held by a planner but not delivered live, so absent from the
			// subscribe set by design.
			continue
		}
		if !slices.Contains(planner, name) {
			t.Errorf("%s takes an owner-scoped id but is not planner-held", name)
		}
	}
}

// $not takes a regex literal; a $regex document there is refused by the server.
// The filter is the rewrite's selector and the release's gate, so a shape the
// server rejects would fail both at once.
func TestBareDocumentIDFilterUsesARegexLiteral(t *testing.T) {
	t.Parallel()

	raw, err := bson.Marshal(BareDocumentIDFilter())
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	encoded := bson.Raw(raw).String()
	if !strings.Contains(encoded, "$regularExpression") {
		t.Fatalf("filter = %s, want a regex literal under $not", encoded)
	}
	if strings.Contains(encoded, `"$regex"`) {
		t.Fatalf("filter = %s, want no $regex document", encoded)
	}
}

// The shared client sets DefaultDocumentM, so a cursor hands back a nested
// document as bson.M; decoding the same bytes without that option gives bson.D.
// Seeding has to take either. Asserting one shape seeds nothing when the other
// turns up, and silently: every migrated document would arrive without the
// version a conditional write compares, which is what happened.
func TestSeedDocumentVersionWalksTheDecodedMetaBlock(t *testing.T) {
	t.Parallel()

	raw, err := bson.Marshal(bson.M{
		"_id":   "job-1",
		"_meta": bson.M{"owner": bson.M{"kind": "account", "id": "acct-1"}},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	asClient, err := UnmarshalDocumentM(raw)
	if err != nil {
		t.Fatalf("decode as the client does: %v", err)
	}
	var asPlain bson.M
	if err := bson.Unmarshal(raw, &asPlain); err != nil {
		t.Fatalf("decode without the option: %v", err)
	}

	for _, tc := range []struct {
		name string
		doc  bson.M
	}{
		{"nested bson.M, as the shared client decodes", asClient},
		{"nested bson.D, as a plain decode gives", asPlain},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, ok := tc.doc["_meta"].(bson.M); ok != (tc.name == "nested bson.M, as the shared client decodes") {
				t.Fatalf("_meta = %T, which is not the shape this case is for", tc.doc["_meta"])
			}

			SeedDocumentVersion(tc.doc)

			meta := AsDocumentM(tc.doc["_meta"])
			if meta == nil {
				t.Fatalf("_meta = %T, want a subdocument", tc.doc["_meta"])
			}
			if meta[MetaFieldVersionKey] != models.InitialDocumentVersion {
				t.Fatalf("version = %v, want %d", meta[MetaFieldVersionKey], models.InitialDocumentVersion)
			}
			if meta["owner"] == nil {
				t.Fatal("seeding the version dropped the owner block")
			}
		})
	}
}

// A document that already counts its writes keeps the count it has.
func TestSeedDocumentVersionLeavesAnExistingCountAlone(t *testing.T) {
	t.Parallel()

	doc := bson.M{"_meta": bson.D{{Key: MetaFieldVersionKey, Value: int64(7)}}}
	SeedDocumentVersion(doc)

	meta := doc["_meta"].(bson.D)
	if len(meta) != 1 || meta[0].Value != int64(7) {
		t.Fatalf("_meta = %v, want the existing count untouched", meta)
	}
}

// A document with no meta block at all is left as it is rather than panicking.
func TestSeedDocumentVersionToleratesAMissingMetaBlock(t *testing.T) {
	t.Parallel()

	doc := bson.M{"_id": "job-1"}
	SeedDocumentVersion(doc)

	if _, present := doc["_meta"]; present {
		t.Fatal("a meta block was invented")
	}
}

// A writer addressing documents across collections gets the stored form for a
// scoped collection and the bare id elsewhere, so it cannot upsert a bare-id
// copy of a document it meant to update.
func TestStoredDocumentIDFollowsTheCollection(t *testing.T) {
	t.Parallel()
	owner := models.AccountOwner("acct-1")

	if got := StoredDocumentID(CollectionJobDocuments, owner, "job-1"); got != "account:acct-1|job-1" {
		t.Fatalf("job_documents id = %q, want the scoped form", got)
	}
	if got := StoredDocumentID(CollectionAccountSettings, owner, "acct-1"); got != "acct-1" {
		t.Fatalf("account_settings id = %q, want the bare id", got)
	}
}
