package sessiongrants

import (
	"context"
	"slices"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/models/planner"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/plannersession"
	eipredis "eve-industry-planner/shared/redis"
	"eve-industry-planner/testing/mongolive"
	"eve-industry-planner/testing/redisfake"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const grantsTestAccount = "scratch-session-grants"

// Grants follow the membership rows, including downwards.
//
// The removal direction is the one worth a test: a session record lives for days,
// so rows dropped without this leave an account's stored grants naming planners it
// is no longer in, and every surface that reads the ceiling keeps letting it in.
//
// Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_WriteFromMemberships_followsTheRows(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	redis := eipredis.NewRedis(redisfake.New(t).Client)
	sessions := plannersession.NewStore(redis)

	kept := models.AccountOwner(grantsTestAccount)
	left := models.CorporationOwner("corp_scratch_grants")
	for _, owner := range []models.Owner{kept, left} {
		seedMembership(t, ctx, mongo, owner, grantsTestAccount)
	}
	t.Cleanup(func() {
		for _, owner := range []models.Owner{kept, left} {
			dropMembership(t, mongo, owner, grantsTestAccount)
		}
	})

	if err := WriteFromMemberships(ctx, mongo, redis, nil, grantsTestAccount); err != nil {
		t.Fatalf("write grants: %v", err)
	}
	if got := storedGrants(t, ctx, sessions); !slices.Contains(got, left.Key()) {
		t.Fatalf("grants = %v, want the corporation the account is a member of", got)
	}

	dropMembership(t, mongo, left, grantsTestAccount)
	if err := WriteFromMemberships(ctx, mongo, redis, nil, grantsTestAccount); err != nil {
		t.Fatalf("rewrite grants: %v", err)
	}

	got := storedGrants(t, ctx, sessions)
	if slices.Contains(got, left.Key()) {
		t.Fatalf("grants = %v, still naming the planner the account left", got)
	}
	if !slices.Contains(got, kept.Key()) {
		t.Fatalf("grants = %v, want the account's own planner kept", got)
	}
}

func storedGrants(t *testing.T, ctx context.Context, sessions *plannersession.Store) models.OwnerKeys {
	t.Helper()
	record, found, err := sessions.AccountRecord(ctx, grantsTestAccount)
	if err != nil {
		t.Fatalf("read account record: %v", err)
	}
	if !found {
		t.Fatal("no account record was written")
	}
	return record.Grants.OwnerKeys
}

// A membership row is what OwnerKeysForAccount reads, so the test writes one
// directly rather than through a join path that would carry its own rules.
func seedMembership(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, owner models.Owner, accountID string) {
	t.Helper()
	membership := planner.Membership{
		SchemaVersion: planner.MembershipSchemaCurrent,
		PlannerID:     owner.Key(),
		AccountID:     accountID,
		JoinedAt:      time.Now().UTC(),
		JoinMethod:    planner.JoinMethod{Owner: &planner.OwnerAccount{}},
	}
	membership.MetaData.Owner = owner
	membership.MetaData.LastModified = time.Now().UTC()
	doc, err := bson.Marshal(membership)
	if err != nil {
		t.Fatalf("marshal membership: %v", err)
	}
	var fields bson.M
	if err := bson.Unmarshal(doc, &fields); err != nil {
		t.Fatalf("decode membership: %v", err)
	}
	fields["_id"] = planner.MembershipID(owner.Key(), accountID)
	coll := mongo.Coll(eipmongo.CollectionPlannerMemberships)
	if _, err := coll.InsertOne(ctx, fields); err != nil {
		t.Fatalf("seed membership for %s: %v", owner.Key(), err)
	}
}

func dropMembership(t *testing.T, mongo *eipmongo.Mongo, owner models.Owner, accountID string) {
	t.Helper()
	coll := mongo.Coll(eipmongo.CollectionPlannerMemberships)
	if _, err := coll.DeleteOne(context.Background(),
		bson.M{"_id": planner.MembershipID(owner.Key(), accountID)}); err != nil {
		t.Fatalf("drop membership for %s: %v", owner.Key(), err)
	}
}
