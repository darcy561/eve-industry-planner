package mongo_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/models/planner"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const (
	joinScratchOwner  = "eip-parity-join-owner"
	joinScratchJoiner = "eip-parity-join-joiner"
)

func TestLive_joinPlannerByInvite_admitsAnAccount(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	owner := models.PlannerOwner(joinScratchOwner)
	plannerID := owner.Key()
	cleanupJoin(t, mongo, plannerID)

	now := time.Now().UTC()
	seedCustomPlanner(t, mongo, owner, now)

	redemption := planner.InviteRedemption{
		InvitedBy: joinScratchOwner,
		IssuedAt:  now,
		InviteID:  "inv-live-1",
	}
	joined, err := mongo.JoinPlannerByInvite(ctx, owner, joinScratchJoiner, redemption, now)
	if err != nil {
		t.Fatalf("join: %v", err)
	}
	if joined.MemberCount != 2 {
		t.Fatalf("member count = %d after a join, want 2", joined.MemberCount)
	}

	owners, err := mongo.OwnerKeysForAccount(ctx, joinScratchJoiner)
	if err != nil {
		t.Fatalf("owner keys: %v", err)
	}
	if !owners.Has(owner) {
		t.Fatalf("owner keys = %v, want the planner just joined", owners)
	}

	var row planner.Membership
	if err := mongo.PlannerMemberships.Collection().
		FindOne(ctx, bson.M{"_id": planner.MembershipID(plannerID, joinScratchJoiner)}).
		Decode(&row); err != nil {
		t.Fatalf("read membership: %v", err)
	}
	if row.JoinMethod.Kind() != planner.JoinKindInvite {
		t.Fatalf("join kind = %q, want the invite branch", row.JoinMethod.Kind())
	}
	if row.JoinMethod.Invite == nil || row.JoinMethod.Invite.InvitedBy != joinScratchOwner {
		t.Fatalf("membership does not record who invited: %+v", row.JoinMethod.Invite)
	}
	if row.MetaData.Owner != owner {
		t.Fatalf("membership owner = %v, want the planner", row.MetaData.Owner)
	}
}

func TestLive_joinPlannerByInvite_isRefusedForAMemberAlready(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	owner := models.PlannerOwner(joinScratchOwner)
	plannerID := owner.Key()
	cleanupJoin(t, mongo, plannerID)

	now := time.Now().UTC()
	seedCustomPlanner(t, mongo, owner, now)
	redemption := planner.InviteRedemption{InvitedBy: joinScratchOwner, IssuedAt: now, InviteID: "inv-live-2"}
	if _, err := mongo.JoinPlannerByInvite(ctx, owner, joinScratchJoiner, redemption, now); err != nil {
		t.Fatalf("first join: %v", err)
	}

	_, err := mongo.JoinPlannerByInvite(ctx, owner, joinScratchJoiner, redemption, now)
	if !errors.Is(err, eipmongo.ErrAlreadyAMember) {
		t.Fatalf("second join = %v, want the already-a-member answer", err)
	}

	held, err := mongo.PlannerMemberships.Collection().
		CountDocuments(ctx, bson.M{"plannerID": plannerID, "accountID": joinScratchJoiner})
	if err != nil {
		t.Fatalf("count rows: %v", err)
	}
	if held != 1 {
		t.Fatalf("%d membership rows, want exactly one", held)
	}
}

func TestLive_joinPlannerByInvite_leavesTheOwnerRowAlone(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	owner := models.PlannerOwner(joinScratchOwner)
	plannerID := owner.Key()
	cleanupJoin(t, mongo, plannerID)

	now := time.Now().UTC()
	seedCustomPlanner(t, mongo, owner, now)
	if _, err := mongo.JoinPlannerByInvite(ctx, owner, joinScratchJoiner,
		planner.InviteRedemption{InvitedBy: joinScratchOwner, IssuedAt: now, InviteID: "inv-live-3"},
		now); err != nil {
		t.Fatalf("join: %v", err)
	}

	var ownerRow planner.Membership
	if err := mongo.PlannerMemberships.Collection().
		FindOne(ctx, bson.M{"_id": planner.MembershipID(plannerID, joinScratchOwner)}).
		Decode(&ownerRow); err != nil {
		t.Fatalf("read the owner row: %v", err)
	}
	if ownerRow.JoinMethod.Kind() != planner.JoinKindOwner {
		t.Fatalf("the owner row now says %q", ownerRow.JoinMethod.Kind())
	}
}

func seedCustomPlanner(t *testing.T, mongo *eipmongo.Mongo, owner models.Owner, now time.Time) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if _, err := mongo.EnsurePlanner(ctx, owner, eipmongo.PlannerWrite{
		Name: "Shared", CreatedBy: joinScratchOwner, Member: true,
	}, now); err != nil {
		t.Fatalf("seed planner: %v", err)
	}
}

func cleanupJoin(t *testing.T, mongo *eipmongo.Mongo, plannerID string) {
	t.Helper()
	drop := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		_, _ = mongo.Planners.Collection().DeleteMany(ctx, bson.M{"_id": plannerID})
		_, _ = mongo.PlannerMemberships.Collection().DeleteMany(ctx, bson.M{"plannerID": plannerID})
		_, _ = mongo.PlannerSettings.Collection().DeleteMany(ctx, bson.M{"_id": plannerID})
	}
	drop()
	t.Cleanup(drop)
}

func TestLive_joinPlannerByInvite_reportsAPlannerThatIsGone(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	owner := models.PlannerOwner("eip-parity-join-never-created")
	cleanupJoin(t, mongo, owner.Key())

	_, err := mongo.JoinPlannerByInvite(ctx, owner, joinScratchJoiner,
		planner.InviteRedemption{InvitedBy: "someone", IssuedAt: time.Now().UTC(), InviteID: "inv-gone"},
		time.Now().UTC())
	if !errors.Is(err, eipmongo.ErrNoSuchPlanner) {
		t.Fatalf("join a planner that does not exist = %v, want the no-such-planner answer", err)
	}
}

func TestLive_joinPlannerByInvite_stopsAtTheMemberCap(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	owner := models.PlannerOwner(joinScratchOwner)
	cleanupJoin(t, mongo, owner.Key())
	now := time.Now().UTC()
	seedCustomPlanner(t, mongo, owner, now)

	redemption := planner.InviteRedemption{InvitedBy: joinScratchOwner, IssuedAt: now, InviteID: "inv-cap"}
	for i := range eipmongo.MaxMembersPerPlanner - 1 {
		account := fmt.Sprintf("%s-%d", joinScratchJoiner, i)
		if _, err := mongo.JoinPlannerByInvite(ctx, owner, account, redemption, now); err != nil {
			t.Fatalf("join %d: %v", i, err)
		}
	}

	if _, err := mongo.JoinPlannerByInvite(ctx, owner, joinScratchJoiner+"-over", redemption, now); !errors.Is(err, eipmongo.ErrPlannerFull) {
		t.Fatalf("join past the cap = %v, want the full answer", err)
	}

	held, err := mongo.PlannerMemberships.Collection().
		CountDocuments(ctx, bson.M{"plannerID": owner.Key()})
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if held != int64(eipmongo.MaxMembersPerPlanner) {
		t.Fatalf("%d members, want the cap of %d", held, eipmongo.MaxMembersPerPlanner)
	}
}

func TestLive_joinPlannerByInvite_correctsADriftedMemberCount(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	owner := models.PlannerOwner(joinScratchOwner)
	cleanupJoin(t, mongo, owner.Key())
	now := time.Now().UTC()
	seedCustomPlanner(t, mongo, owner, now)

	if _, err := mongo.Planners.Collection().UpdateOne(ctx,
		bson.M{"_id": owner.Key()}, bson.M{"$set": bson.M{"memberCount": 47}}); err != nil {
		t.Fatalf("drift the count: %v", err)
	}

	joined, err := mongo.JoinPlannerByInvite(ctx, owner, joinScratchJoiner,
		planner.InviteRedemption{InvitedBy: joinScratchOwner, IssuedAt: now, InviteID: "inv-drift"}, now)
	if err != nil {
		t.Fatalf("join: %v", err)
	}
	if joined.MemberCount != 2 {
		t.Fatalf("member count = %d after a join, want the 2 rows that exist", joined.MemberCount)
	}
}
