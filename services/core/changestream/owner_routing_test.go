package changestream

import (
	"testing"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// The owner a document states is what every message is routed by: it becomes the
// NATS subject's tenant and the key the websocket switches on. A document whose
// owner cannot be read routes to explicit subscribers only, so the failure is a
// message reaching too few clients rather than the wrong ones.
func TestOwnerFromDocument(t *testing.T) {
	t.Parallel()

	// Raw strings rather than mongolive.OwnerDoc: the cases below include a kind
	// that is not an OwnerKind at all, which a typed owner cannot express.
	metaOwner := func(kind, id string) bson.M {
		return bson.M{"_meta": bson.M{"owner": bson.M{"kind": kind, "id": id}}}
	}

	for name, tc := range map[string]struct {
		doc  bson.M
		want models.Owner
	}{
		"account": {
			doc:  metaOwner("account", "acct-1"),
			want: models.Owner{Kind: models.OwnerAccount, ID: "acct-1"},
		},
		"corporation carrying a ref": {
			doc:  metaOwner("corporation", "corp_56_JxK"),
			want: models.Owner{Kind: models.OwnerCorporation, ID: "corp_56_JxK"},
		},
		// A raw EVE id here would mean the conversion boundary was missed. Refused
		// rather than routed, because an org key naming a raw id addresses a tenant
		// no client is subscribed to.
		"corporation carrying a raw eve id": {
			doc:  metaOwner("corporation", "98000001"),
			want: models.Owner{},
		},
		"unknown kind":     {doc: metaOwner("wardec", "x"), want: models.Owner{}},
		"empty id":         {doc: metaOwner("account", ""), want: models.Owner{}},
		"no owner in meta": {doc: bson.M{"_meta": bson.M{"clientID": "c1"}}, want: models.Owner{}},
		"no meta at all":   {doc: bson.M{"_id": "job-1"}, want: models.Owner{}},
		"nil document":     {doc: nil, want: models.Owner{}},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			got, _ := ownerFromDocument(tc.doc)
			if got != tc.want {
				t.Fatalf("owner = %+v, want %+v", got, tc.want)
			}
		})
	}
}

// The subject's tenant and the message's owner key are the same string. They are
// built from one value, and a message whose key disagreed with its subject would
// be delivered to clients the subject never reached.
func TestOwnerKeyMatchesTheSubjectTenant(t *testing.T) {
	t.Parallel()
	for _, owner := range []models.Owner{
		{Kind: models.OwnerAccount, ID: "acct-1"},
		{Kind: models.OwnerCorporation, ID: "corp_56_JxK"},
		{Kind: models.OwnerAlliance, ID: "alliance_9_Qm"},
		{Kind: models.OwnerPlanner, ID: "01J8Z5"},
	} {
		doc := bson.M{"_meta": bson.M{"owner": bson.M{
			"kind": string(owner.Kind), "id": owner.ID,
		}}}
		got, _ := ownerFromDocument(doc)
		if got != owner {
			t.Fatalf("owner = %+v, want %+v", got, owner)
		}
		if got.Key() != owner.Key() {
			t.Fatalf("key = %q, want %q", got.Key(), owner.Key())
		}
	}
}

// A group names its account at the document root rather than in _meta, so the
// message still has an owner to route by.
func TestGroupsRouteFromTheRootAccountID(t *testing.T) {
	t.Parallel()
	doc := bson.M{"_id": "group-1", "accountID": "acct-1"}

	owner, _ := ownerFromDocument(doc)
	if !owner.IsZero() {
		t.Fatalf("a root accountID is not an owner block: got %+v", owner)
	}

	// The watcher falls back to it, which is what keeps groups routable.
	recovered := models.AccountOwner("acct-1")
	if recovered.Key() != "account:acct-1" {
		t.Fatalf("fallback key = %q", recovered.Key())
	}
}
