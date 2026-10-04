package mongo

import (
	"slices"
	"strings"
	"testing"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
)

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

func TestOwnerScopedIDCollectionsExcludeTheAccountSingletons(t *testing.T) {
	t.Parallel()

	for _, singleton := range AccountOwnedCollections() {
		if slices.Contains(OwnerScopedIDCollections(), singleton) {
			t.Errorf("%s holds account singletons and must keep bare ids", singleton)
		}
	}
}

func TestOwnerScopedIDCollectionsArePlannerHeld(t *testing.T) {
	t.Parallel()

	planner := PlannerHeldCollections()
	for _, name := range OwnerScopedIDCollections() {
		if name == CollectionArchivedJobs || name == CollectionGroupTemplatePayloads {
			continue
		}
		if !slices.Contains(planner, name) {
			t.Errorf("%s takes an owner-scoped id but is not planner-held", name)
		}
	}
}

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

func TestSeedDocumentRevisionWalksTheDecodedMetaBlock(t *testing.T) {
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

			SeedDocumentRevision(tc.doc)

			meta := AsDocumentM(tc.doc["_meta"])
			if meta == nil {
				t.Fatalf("_meta = %T, want a subdocument", tc.doc["_meta"])
			}
			if meta[models.MetaFieldRevision] != models.InitialDocumentRevision {
				t.Fatalf("version = %v, want %d", meta[models.MetaFieldRevision], models.InitialDocumentRevision)
			}
			if meta["owner"] == nil {
				t.Fatal("seeding the version dropped the owner block")
			}
		})
	}
}

func TestSeedDocumentRevisionLeavesAnExistingCountAlone(t *testing.T) {
	t.Parallel()

	doc := bson.M{"_meta": bson.D{{Key: models.MetaFieldRevision, Value: int64(7)}}}
	SeedDocumentRevision(doc)

	meta := doc["_meta"].(bson.D)
	if len(meta) != 1 || meta[0].Value != int64(7) {
		t.Fatalf("_meta = %v, want the existing count untouched", meta)
	}
}

func TestSeedDocumentRevisionToleratesAMissingMetaBlock(t *testing.T) {
	t.Parallel()

	doc := bson.M{"_id": "job-1"}
	SeedDocumentRevision(doc)

	if _, present := doc["_meta"]; present {
		t.Fatal("a meta block was invented")
	}
}

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
