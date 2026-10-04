package mongo_test

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/models/planner"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const esiMembershipScratchAccount = "eip-parity-esi-membership-account"

const (
	esiCorpRefA     = "corp_56_J_DzQdPpjXwi9Xtp3C8bri9Bfi0Z94qUulkbKCac"
	esiCorpRefB     = "corp_56_K_EzReRqQkYxj0Yuq4D9csj0Cgj1a05rVvmlcLDbd"
	esiAllianceRefA = "alliance_56_L_FzSfSrRlZyk1Zvr5E0dtk1Dhk2b16sWwnmdMEce"
)

func TestLive_reconcileEntityMemberships_followsTheDerivedSet(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	account := esiMembershipScratchAccount + "-follow"
	corpA := models.CorporationOwner(esiCorpRefA)
	corpB := models.CorporationOwner(esiCorpRefB)
	if corpA.IsZero() || corpB.IsZero() {
		t.Fatal("the test refs do not parse as owners")
	}
	cleanupMemberships(t, mongo, account)
	now := time.Now().UTC()

	added, removed, err := mongo.ReconcileEntityMemberships(ctx, account, []models.Owner{corpA}, now)
	if err != nil {
		t.Fatalf("first reconcile: %v", err)
	}
	if added != 1 || removed != 0 {
		t.Fatalf("first reconcile added %d removed %d, want 1 and 0", added, removed)
	}
	assertReachable(ctx, t, mongo, account, corpA, true)

	added, removed, err = mongo.ReconcileEntityMemberships(ctx, account, []models.Owner{corpA}, now)
	if err != nil {
		t.Fatalf("repeat reconcile: %v", err)
	}
	if added != 0 || removed != 0 {
		t.Errorf("repeat reconcile added %d removed %d, want no change", added, removed)
	}

	added, removed, err = mongo.ReconcileEntityMemberships(ctx, account, []models.Owner{corpB}, now)
	if err != nil {
		t.Fatalf("move reconcile: %v", err)
	}
	if added != 1 || removed != 1 {
		t.Errorf("move reconcile added %d removed %d, want 1 and 1", added, removed)
	}
	assertReachable(ctx, t, mongo, account, corpA, false)
	assertReachable(ctx, t, mongo, account, corpB, true)

	if _, removed, err = mongo.ReconcileEntityMemberships(ctx, account, nil, now); err != nil {
		t.Fatalf("empty reconcile: %v", err)
	}
	if removed != 1 {
		t.Errorf("empty reconcile removed %d, want 1", removed)
	}
	assertReachable(ctx, t, mongo, account, corpB, false)
}

func TestLive_reconcileEntityMemberships_leavesOtherJoinMethodsAlone(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	account := esiMembershipScratchAccount + "-invited"
	corp := models.CorporationOwner(esiCorpRefA)
	cleanupMemberships(t, mongo, account)
	now := time.Now().UTC()

	invited := planner.Membership{
		ID:            planner.MembershipID(corp.Key(), account),
		SchemaVersion: planner.MembershipSchemaCurrent,
		PlannerID:     corp.Key(),
		AccountID:     account,
		JoinedAt:      now,
		JoinMethod:    planner.JoinMethod{Invite: &planner.InviteRedemption{InvitedBy: "someone-else"}},
	}
	invited.MetaData.Owner = corp
	invited.MetaData.LastModified = now
	if _, err := mongo.PlannerMemberships.Collection().InsertOne(ctx, invited); err != nil {
		t.Fatalf("write the invited membership: %v", err)
	}

	added, removed, err := mongo.ReconcileEntityMemberships(ctx, account, nil, now)
	if err != nil {
		t.Fatalf("reconcile: %v", err)
	}
	if added != 0 || removed != 0 {
		t.Errorf("reconcile added %d removed %d against an invite-only account, want no change",
			added, removed)
	}
	assertReachable(ctx, t, mongo, account, corp, true)
}

func TestLive_reconcileEntityMemberships_refusesNonESIKinds(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	account := esiMembershipScratchAccount + "-kinds"
	cleanupMemberships(t, mongo, account)

	if _, _, err := mongo.ReconcileEntityMemberships(ctx, account,
		[]models.Owner{models.AccountOwner(account)}, time.Now().UTC()); err == nil {
		t.Fatal("an account owner was accepted as an entity membership")
	}
}

func TestLive_reconcileEntityMemberships_grantsFollowTheRow(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	account := esiMembershipScratchAccount + "-grants"
	alliance := models.AllianceOwner(esiAllianceRefA)
	if alliance.IsZero() {
		t.Fatal("the test alliance ref does not parse as an owner")
	}
	cleanupMemberships(t, mongo, account)

	if _, _, err := mongo.ReconcileEntityMemberships(ctx, account,
		[]models.Owner{alliance}, time.Now().UTC()); err != nil {
		t.Fatalf("reconcile: %v", err)
	}

	granted, err := mongo.OwnerKeysForAccount(ctx, account)
	if err != nil {
		t.Fatalf("OwnerKeysForAccount: %v", err)
	}
	if !granted.Has(alliance) {
		t.Errorf("grants = %v, want the alliance the account is in", granted)
	}

	count, err := mongo.Planners.Collection().
		CountDocuments(ctx, bson.M{"_id": alliance.Key()})
	if err != nil {
		t.Fatalf("count planners: %v", err)
	}
	if count != 0 {
		t.Error("the reconcile created a planner document")
	}
}

func cleanupMemberships(t *testing.T, mongo *eipmongo.Mongo, account string) {
	t.Helper()
	clear := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		_, _ = mongo.PlannerMemberships.Collection().
			DeleteMany(ctx, bson.M{"accountID": account})
	}
	clear()
	t.Cleanup(clear)
}

func assertReachable(ctx context.Context, t *testing.T, mongo *eipmongo.Mongo, account string, owner models.Owner, want bool) {
	t.Helper()
	got, err := mongo.AccountMayReach(ctx, account, owner)
	if err != nil {
		t.Fatalf("AccountMayReach(%s): %v", owner.Key(), err)
	}
	if got != want {
		t.Errorf("AccountMayReach(%s) = %v, want %v", owner.Key(), got, want)
	}
}

func TestLive_ownerMembership_survivesAReconcile(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	account := esiMembershipScratchAccount + "-self"
	owner := models.AccountOwner(account)
	cleanupMemberships(t, mongo, account)
	t.Cleanup(func() {
		cleanupCtx, cancelCleanup := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancelCleanup()
		_, _ = mongo.Planners.Collection().DeleteOne(cleanupCtx, bson.M{"_id": owner.Key()})
		_, _ = mongo.PlannerSettings.Collection().DeleteOne(cleanupCtx, bson.M{"_id": owner.Key()})
	})

	if err := mongo.EnsureAccountPlanner(ctx, account, time.Now().UTC().AddDate(-1, 0, 0)); err != nil {
		t.Fatalf("EnsureAccountPlanner: %v", err)
	}
	assertReachable(ctx, t, mongo, account, owner, true)

	if _, removed, err := mongo.ReconcileEntityMemberships(ctx, account, nil, time.Now().UTC()); err != nil {
		t.Fatalf("reconcile: %v", err)
	} else if removed != 0 {
		t.Errorf("reconcile removed %d rows from an account holding only its own planner", removed)
	}
	assertReachable(ctx, t, mongo, account, owner, true)
}

func TestLive_plannersForAccount_listsNamedAndUnnamed(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	account := esiMembershipScratchAccount + "-listing"
	own := models.AccountOwner(account)
	corp := models.CorporationOwner(esiCorpRefA)
	cleanupMemberships(t, mongo, account)
	t.Cleanup(func() {
		cleanupCtx, cancelCleanup := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancelCleanup()
		_, _ = mongo.Planners.Collection().DeleteOne(cleanupCtx, bson.M{"_id": own.Key()})
		_, _ = mongo.PlannerSettings.Collection().DeleteOne(cleanupCtx, bson.M{"_id": own.Key()})
	})

	now := time.Now().UTC()
	if err := mongo.EnsureAccountPlanner(ctx, account, now); err != nil {
		t.Fatalf("EnsureAccountPlanner: %v", err)
	}
	if _, _, err := mongo.ReconcileEntityMemberships(ctx, account, []models.Owner{corp}, now); err != nil {
		t.Fatalf("reconcile: %v", err)
	}

	listings, err := mongo.PlannersForAccount(ctx, account)
	if err != nil {
		t.Fatalf("PlannersForAccount: %v", err)
	}

	byKey := make(map[string]eipmongo.PlannerListing, len(listings))
	for _, listing := range listings {
		byKey[listing.Owner.Key()] = listing
	}
	if len(byKey) != 2 {
		t.Fatalf("listed %d planners, want the account's own and the corporation", len(byKey))
	}

	mine, found := byKey[own.Key()]
	if !found {
		t.Fatal("the account's own planner is missing from its listing")
	}
	if !mine.Named || mine.Name == "" {
		t.Errorf("own planner = %+v, want it named", mine)
	}
	if mine.JoinKind != planner.JoinKindOwner {
		t.Errorf("own planner join kind = %q, want %q", mine.JoinKind, planner.JoinKindOwner)
	}

	theirs, found := byKey[corp.Key()]
	if !found {
		t.Fatal("a corporation the account is in is missing from its listing")
	}
	if theirs.Named || theirs.Name != "" {
		t.Errorf("corporation planner = %+v, want it unnamed", theirs)
	}
	if theirs.JoinKind != planner.JoinKindMember {
		t.Errorf("corporation join kind = %q, want %q", theirs.JoinKind, planner.JoinKindMember)
	}
}

func TestLive_plannersForAccount_writesNothing(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	account := esiMembershipScratchAccount + "-listing-read-only"
	corp := models.CorporationOwner(esiCorpRefA)
	cleanupMemberships(t, mongo, account)

	if _, _, err := mongo.ReconcileEntityMemberships(ctx, account,
		[]models.Owner{corp}, time.Now().UTC()); err != nil {
		t.Fatalf("reconcile: %v", err)
	}
	if _, err := mongo.PlannersForAccount(ctx, account); err != nil {
		t.Fatalf("PlannersForAccount: %v", err)
	}

	count, err := mongo.Planners.Collection().CountDocuments(ctx, bson.M{"_id": corp.Key()})
	if err != nil {
		t.Fatalf("count planners: %v", err)
	}
	if count != 0 {
		t.Error("listing created a planner document")
	}
}

func TestLive_reconcileEntityMemberships_clearsAnNPCCorporationRow(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	account := esiMembershipScratchAccount + "-npc"
	corp := models.CorporationOwner(esiCorpRefA)
	cleanupMemberships(t, mongo, account)
	now := time.Now().UTC()

	if _, _, err := mongo.ReconcileEntityMemberships(ctx, account, []models.Owner{corp}, now); err != nil {
		t.Fatalf("seed the row: %v", err)
	}
	assertReachable(ctx, t, mongo, account, corp, true)

	_, removed, err := mongo.ReconcileEntityMemberships(ctx, account, nil, now)
	if err != nil {
		t.Fatalf("reconcile: %v", err)
	}
	if removed != 1 {
		t.Errorf("removed = %d, want the excluded row cleared", removed)
	}
	assertReachable(ctx, t, mongo, account, corp, false)
}
