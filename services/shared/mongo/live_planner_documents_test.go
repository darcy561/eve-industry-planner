package mongo_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/models/planner"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

const plannerScratchAccount = "eip-parity-planner-account"

const sharedPlannerCorpRef = "corp_56_K_EzReRqQkYxj0Yuq4D9csj0Cgj1a05rVvmlcLDbd"

func TestLive_plannerAndMembership_roundTrip(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	owner := models.AccountOwner(plannerScratchAccount)
	plannerID := owner.Key()
	membershipID := planner.MembershipID(plannerID, plannerScratchAccount)

	t.Cleanup(func() {
		cleanupCtx, cancelCleanup := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancelCleanup()
		_, _ = mongo.Planners.Collection().DeleteMany(cleanupCtx, bson.M{"_id": plannerID})
		_, _ = mongo.PlannerMemberships.Collection().DeleteMany(cleanupCtx, bson.M{"_id": membershipID})
	})

	plannerDoc := planner.Planner{
		ID:            plannerID,
		SchemaVersion: planner.SchemaCurrent,
		Name:          "Round trip",
		MemberCount:   1,
		CreatedBy:     plannerScratchAccount,
	}
	plannerDoc.MetaData.Owner = owner
	if _, err := mongo.Planners.UpsertStructPreservingMeta(ctx, plannerDoc, plannerDoc.ID); err != nil {
		t.Fatalf("write planner: %v", err)
	}

	membership := planner.Membership{
		ID:            membershipID,
		SchemaVersion: planner.MembershipSchemaCurrent,
		PlannerID:     plannerID,
		AccountID:     plannerScratchAccount,
		JoinedAt:      time.Now().UTC().Truncate(time.Millisecond),
		JoinMethod:    planner.JoinMethod{Owner: &planner.OwnerAccount{}},
	}
	if err := membership.JoinMethod.Validate(); err != nil {
		t.Fatalf("membership is not writable: %v", err)
	}
	if _, err := mongo.PlannerMemberships.UpsertStructPreservingMeta(ctx, membership, membership.ID); err != nil {
		t.Fatalf("write membership: %v", err)
	}

	var readBack planner.Planner
	if err := mongo.Planners.Collection().FindOne(ctx, bson.M{"_id": plannerID}).Decode(&readBack); err != nil {
		t.Fatalf("read planner: %v", err)
	}
	gotOwner, err := readBack.Owner()
	if err != nil {
		t.Fatalf("planner id does not parse as an owner: %v", err)
	}
	if gotOwner != owner {
		t.Fatalf("owner from stored id = %v, want %v", gotOwner, owner)
	}
	if readBack.Shared() {
		t.Fatal("a one-member planner must not report as shared")
	}

	var storedMembership planner.Membership
	if err := mongo.PlannerMemberships.Collection().FindOne(ctx, bson.M{"_id": membershipID}).Decode(&storedMembership); err != nil {
		t.Fatalf("read membership: %v", err)
	}
	if got := storedMembership.JoinMethod.Kind(); got != planner.JoinKindOwner {
		t.Fatalf("join kind = %q, want %q", got, planner.JoinKindOwner)
	}
	gotPlanner, gotAccount, ok := planner.SplitMembershipID(storedMembership.ID)
	if !ok || gotPlanner != plannerID || gotAccount != plannerScratchAccount {
		t.Fatalf("stored row id %q did not split back to (%q, %q)", storedMembership.ID, plannerID, plannerScratchAccount)
	}

	byAccount, err := mongo.PlannerMemberships.Collection().CountDocuments(ctx, bson.M{"accountID": plannerScratchAccount})
	if err != nil || byAccount == 0 {
		t.Fatalf("lookup by accountID found %d rows (err %v)", byAccount, err)
	}
	byPlanner, err := mongo.PlannerMemberships.Collection().CountDocuments(ctx, bson.M{"plannerID": plannerID})
	if err != nil || byPlanner == 0 {
		t.Fatalf("lookup by plannerID found %d rows (err %v)", byPlanner, err)
	}
}

func TestLive_ensureAccountPlanner_isInsertOnly(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	const accountID = "eip-parity-ensure-account"
	owner := models.AccountOwner(accountID)
	plannerID := owner.Key()
	membershipID := planner.MembershipID(plannerID, accountID)

	t.Cleanup(func() {
		cleanupCtx, cancelCleanup := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancelCleanup()
		_, _ = mongo.Planners.Collection().DeleteMany(cleanupCtx, bson.M{"_id": plannerID})
		_, _ = mongo.PlannerMemberships.Collection().DeleteMany(cleanupCtx, bson.M{"_id": membershipID})
	})

	now := time.Now().UTC()
	if held, err := mongo.Planners.Collection().CountDocuments(ctx, bson.M{"_id": plannerID}); err != nil || held != 0 {
		t.Fatalf("planners holding %s before create = %d (err %v), want none", plannerID, held, err)
	}
	if err := mongo.EnsureAccountPlanner(ctx, accountID, now); err != nil {
		t.Fatalf("first EnsureAccountPlanner: %v", err)
	}
	if held, err := mongo.Planners.Collection().CountDocuments(ctx, bson.M{"_id": plannerID}); err != nil || held != 1 {
		t.Fatalf("planners holding %s after create = %d (err %v), want one", plannerID, held, err)
	}

	if _, err := mongo.Planners.Collection().UpdateOne(ctx,
		bson.M{"_id": plannerID},
		bson.M{"$set": bson.M{"name": "Renamed by its owner"}},
	); err != nil {
		t.Fatalf("rename planner: %v", err)
	}

	if err := mongo.EnsureAccountPlanner(ctx, accountID, now.Add(time.Hour)); err != nil {
		t.Fatalf("second EnsureAccountPlanner: %v", err)
	}

	var readBack planner.Planner
	if err := mongo.Planners.Collection().FindOne(ctx, bson.M{"_id": plannerID}).Decode(&readBack); err != nil {
		t.Fatalf("read planner: %v", err)
	}
	if readBack.Name != "Renamed by its owner" {
		t.Fatalf("planner name = %q, want the rename to survive a repeat call", readBack.Name)
	}

	rows, err := mongo.PlannerMemberships.Collection().CountDocuments(ctx, bson.M{"plannerID": plannerID})
	if err != nil {
		t.Fatalf("count memberships: %v", err)
	}
	if rows != 1 {
		t.Fatalf("membership rows = %d, want exactly one after two calls", rows)
	}
}

func TestLive_ensureAccountPlanner_repairsEitherHalfAlone(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	const accountID = "eip-parity-repair-account"
	plannerID := models.AccountOwner(accountID).Key()
	membershipID := planner.MembershipID(plannerID, accountID)

	t.Cleanup(func() {
		cleanupCtx, cancelCleanup := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancelCleanup()
		_, _ = mongo.Planners.Collection().DeleteMany(cleanupCtx, bson.M{"_id": plannerID})
		_, _ = mongo.PlannerMemberships.Collection().DeleteMany(cleanupCtx, bson.M{"_id": membershipID})
	})

	now := time.Now().UTC()
	if err := mongo.EnsureAccountPlanner(ctx, accountID, now); err != nil {
		t.Fatalf("create: %v", err)
	}

	if _, err := mongo.Planners.Collection().UpdateOne(ctx,
		bson.M{"_id": plannerID}, bson.M{"$set": bson.M{"name": "Kept through the repair"}}); err != nil {
		t.Fatalf("rename planner: %v", err)
	}
	if _, err := mongo.PlannerMemberships.Collection().DeleteOne(ctx, bson.M{"_id": membershipID}); err != nil {
		t.Fatalf("delete membership: %v", err)
	}
	if err := mongo.EnsureAccountPlanner(ctx, accountID, now); err != nil {
		t.Fatalf("repair membership: %v", err)
	}

	var membership planner.Membership
	if err := mongo.PlannerMemberships.Collection().FindOne(ctx, bson.M{"_id": membershipID}).Decode(&membership); err != nil {
		t.Fatalf("membership was not restored: %v", err)
	}
	if got := membership.JoinMethod.Kind(); got != planner.JoinKindOwner {
		t.Fatalf("restored join kind = %q, want %q", got, planner.JoinKindOwner)
	}
	var plannerDoc planner.Planner
	if err := mongo.Planners.Collection().FindOne(ctx, bson.M{"_id": plannerID}).Decode(&plannerDoc); err != nil {
		t.Fatalf("read planner: %v", err)
	}
	if plannerDoc.Name != "Kept through the repair" {
		t.Fatalf("planner name = %q, want the repair to leave the surviving half alone", plannerDoc.Name)
	}

	if _, err := mongo.Planners.Collection().DeleteOne(ctx, bson.M{"_id": plannerID}); err != nil {
		t.Fatalf("delete planner: %v", err)
	}
	if err := mongo.EnsureAccountPlanner(ctx, accountID, now); err != nil {
		t.Fatalf("repair planner: %v", err)
	}
	if err := mongo.Planners.Collection().FindOne(ctx, bson.M{"_id": plannerID}).Decode(&plannerDoc); err != nil {
		t.Fatalf("planner was not restored: %v", err)
	}
	rows, err := mongo.PlannerMemberships.Collection().CountDocuments(ctx, bson.M{"plannerID": plannerID})
	if err != nil {
		t.Fatalf("count memberships: %v", err)
	}
	if rows != 1 {
		t.Fatalf("membership rows = %d, want the surviving row not to be duplicated", rows)
	}
}

func TestLive_ownerKeysForAccount_areTheAccountsMemberships(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	const accountID = "eip-parity-grants-account"
	ownPlanner := models.AccountOwner(accountID).Key()
	sharedPlanner := "planner:01HZY6R3QK7T9V2M4N8P0XW5AB"
	sharedRow := planner.MembershipID(sharedPlanner, accountID)

	t.Cleanup(func() {
		cleanupCtx, cancelCleanup := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancelCleanup()
		_, _ = mongo.Planners.Collection().DeleteMany(cleanupCtx, bson.M{"_id": ownPlanner})
		_, _ = mongo.PlannerMemberships.Collection().DeleteMany(cleanupCtx, bson.M{"accountID": accountID})
	})

	if err := mongo.EnsureAccountPlanner(ctx, accountID, time.Now().UTC()); err != nil {
		t.Fatalf("create own planner: %v", err)
	}

	granted, err := mongo.OwnerKeysForAccount(ctx, accountID)
	if err != nil {
		t.Fatalf("OwnerKeysForAccount: %v", err)
	}
	if !granted.Has(models.AccountOwner(accountID)) {
		t.Fatalf("granted = %v, want the account's own planner", granted)
	}
	if len(granted) != 1 {
		t.Fatalf("granted = %v, want only the account's own planner", granted)
	}

	if _, err := mongo.PlannerMemberships.Collection().InsertOne(ctx, bson.M{
		"_id":           sharedRow,
		"schemaVersion": planner.MembershipSchemaCurrent,
		"plannerID":     sharedPlanner,
		"accountID":     accountID,
		"joinedAt":      time.Now().UTC(),
		"joinMethod":    bson.M{"invite": bson.M{"invitedBy": "someone", "issuedAt": time.Now().UTC()}},
	}); err != nil {
		t.Fatalf("join shared planner: %v", err)
	}

	granted, err = mongo.OwnerKeysForAccount(ctx, accountID)
	if err != nil {
		t.Fatalf("OwnerKeysForAccount after join: %v", err)
	}
	if len(granted) != 2 {
		t.Fatalf("granted = %v, want the account's own planner and the shared one", granted)
	}

	mayReach, err := mongo.AccountMayReach(ctx, accountID, models.Owner{Kind: models.OwnerPlanner, ID: "01HZY6R3QK7T9V2M4N8P0XW5AB"})
	if err != nil {
		t.Fatalf("AccountMayReach: %v", err)
	}
	if !mayReach {
		t.Fatal("a member must reach the planner it holds a row for")
	}
	if _, err := mongo.PlannerMemberships.Collection().DeleteOne(ctx, bson.M{"_id": sharedRow}); err != nil {
		t.Fatalf("leave shared planner: %v", err)
	}
	mayReach, err = mongo.AccountMayReach(ctx, accountID, models.Owner{Kind: models.OwnerPlanner, ID: "01HZY6R3QK7T9V2M4N8P0XW5AB"})
	if err != nil {
		t.Fatalf("AccountMayReach after leave: %v", err)
	}
	if mayReach {
		t.Fatal("a removed member must be refused on the next read, not at the next login")
	}
}

func TestLive_ensureAccountPlanner_seedsSettingsFromTheAccount(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	account := plannerScratchAccount + "-settings"
	owner := models.AccountOwner(account)
	now := time.Now().UTC().Truncate(time.Millisecond)

	t.Cleanup(func() {
		cleanupCtx, cancelCleanup := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancelCleanup()
		_, _ = mongo.Planners.Collection().DeleteOne(cleanupCtx, bson.M{"_id": owner.Key()})
		_, _ = mongo.PlannerMemberships.Collection().DeleteOne(cleanupCtx,
			bson.M{"_id": planner.MembershipID(owner.Key(), account)})
		_, _ = mongo.PlannerSettings.Collection().DeleteOne(cleanupCtx, bson.M{"_id": owner.Key()})
		_, _ = mongo.ApplicationSettings.Collection().DeleteOne(cleanupCtx, bson.M{"_id": account})
	})

	seed := models.DefaultApplicationSettings(account, now)
	seed.DefaultMaterialEfficiencyValue = 9
	seed.CustomStructures = models.CustomStructures{{ID: "cs-1", JobType: models.JobTypeManufacturing, Name: "Home"}}
	if _, _, err := mongo.ApplicationSettings.UpsertApplicationSettings(ctx, account, seed); err != nil {
		t.Fatalf("seed account settings: %v", err)
	}

	if err := mongo.EnsureAccountPlanner(ctx, account, now); err != nil {
		t.Fatalf("EnsureAccountPlanner: %v", err)
	}

	settings, found, err := mongo.LoadPlannerSettings(ctx, owner)
	if err != nil {
		t.Fatalf("LoadPlannerSettings: %v", err)
	}
	if !found {
		t.Fatal("a planner that was just ensured has no settings")
	}
	if settings.DefaultMaterialEfficiencyValue != 9 {
		t.Errorf("ME = %d, want the account's 9", settings.DefaultMaterialEfficiencyValue)
	}
	if len(settings.CustomStructures) != 1 {
		t.Errorf("custom structures = %+v, want the account's", settings.CustomStructures)
	}
	if settings.MetaData.LastModified.IsZero() {
		t.Error("settings carry no realtime cursor")
	}

	settings.DefaultMaterialEfficiencyValue = 3
	if err := mongo.PlannerSettings.Collection().FindOneAndReplace(ctx,
		bson.M{"_id": owner.Key()}, settings).Err(); err != nil {
		t.Fatalf("change the planner's settings: %v", err)
	}
	if err := mongo.EnsureAccountPlanner(ctx, account, now.Add(time.Hour)); err != nil {
		t.Fatalf("second EnsureAccountPlanner: %v", err)
	}
	again, _, err := mongo.LoadPlannerSettings(ctx, owner)
	if err != nil {
		t.Fatalf("LoadPlannerSettings after repeat: %v", err)
	}
	if again.DefaultMaterialEfficiencyValue != 3 {
		t.Errorf("ME = %d after a repeat call, want the planner's own 3",
			again.DefaultMaterialEfficiencyValue)
	}
}

func TestLive_loadPlannerSettings_reportsAbsentRatherThanFailing(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	_, found, err := mongo.LoadPlannerSettings(ctx, models.AccountOwner(plannerScratchAccount+"-absent"))
	if err != nil {
		t.Fatalf("LoadPlannerSettings: %v", err)
	}
	if found {
		t.Fatal("a planner that was never ensured reports settings")
	}
}

func TestLive_ensurePlanner_differsOnlyInMembershipAndSeed(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	account := plannerScratchAccount + "-write-shape"
	shared := models.CorporationOwner(sharedPlannerCorpRef)
	now := time.Now().UTC()

	t.Cleanup(func() {
		cleanupCtx, cancelCleanup := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancelCleanup()
		for _, owner := range []models.Owner{models.AccountOwner(account), shared} {
			_, _ = mongo.Planners.Collection().DeleteOne(cleanupCtx, bson.M{"_id": owner.Key()})
			_, _ = mongo.PlannerSettings.Collection().DeleteOne(cleanupCtx, bson.M{"_id": owner.Key()})
			_, _ = mongo.PlannerMemberships.Collection().
				DeleteMany(cleanupCtx, bson.M{"plannerID": owner.Key()})
		}
		_, _ = mongo.ApplicationSettings.Collection().DeleteOne(cleanupCtx, bson.M{"_id": account})
	})

	seed := models.DefaultApplicationSettings(account, now)
	seed.DefaultMaterialEfficiencyValue = 9
	if _, _, err := mongo.ApplicationSettings.UpsertApplicationSettings(ctx, account, seed); err != nil {
		t.Fatalf("seed account settings: %v", err)
	}

	if err := mongo.EnsureAccountPlanner(ctx, account, now); err != nil {
		t.Fatalf("EnsureAccountPlanner: %v", err)
	}
	if _, err := mongo.EnsurePlanner(ctx, shared, eipmongo.PlannerWrite{
		Name:      "A shared planner",
		CreatedBy: account,
	}, now); err != nil {
		t.Fatalf("EnsurePlanner: %v", err)
	}

	assertReachable(ctx, t, mongo, account, models.AccountOwner(account), true)
	assertReachable(ctx, t, mongo, account, shared, false)

	own, _, err := mongo.LoadPlannerSettings(ctx, models.AccountOwner(account))
	if err != nil {
		t.Fatalf("LoadPlannerSettings: %v", err)
	}
	if own.DefaultMaterialEfficiencyValue != 9 {
		t.Errorf("own planner ME = %d, want the account's 9", own.DefaultMaterialEfficiencyValue)
	}
	theirs, found, err := mongo.LoadPlannerSettings(ctx, shared)
	if err != nil {
		t.Fatalf("LoadPlannerSettings: %v", err)
	}
	if !found {
		t.Fatal("a shared planner was written without settings")
	}
	if theirs.DefaultMaterialEfficiencyValue == 9 {
		t.Error("a shared planner inherited the settings of whoever named it")
	}
}

func TestLive_updatePlannerSettings_setsOnlyWhatItNames(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	account := plannerScratchAccount + "-update"
	owner := models.AccountOwner(account)
	now := time.Now().UTC().Truncate(time.Millisecond)

	t.Cleanup(func() {
		cleanupCtx, cancelCleanup := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancelCleanup()
		_, _ = mongo.Planners.Collection().DeleteOne(cleanupCtx, bson.M{"_id": owner.Key()})
		_, _ = mongo.PlannerMemberships.Collection().DeleteOne(cleanupCtx,
			bson.M{"_id": planner.MembershipID(owner.Key(), account)})
		_, _ = mongo.PlannerSettings.Collection().DeleteOne(cleanupCtx, bson.M{"_id": owner.Key()})
		_, _ = mongo.ApplicationSettings.Collection().DeleteOne(cleanupCtx, bson.M{"_id": account})
	})

	seed := models.DefaultApplicationSettings(account, now)
	seed.DefaultMaterialEfficiencyValue = 7
	if _, _, err := mongo.ApplicationSettings.UpsertApplicationSettings(ctx, account, seed); err != nil {
		t.Fatalf("seed account settings: %v", err)
	}
	if err := mongo.EnsureAccountPlanner(ctx, account, now); err != nil {
		t.Fatalf("EnsureAccountPlanner: %v", err)
	}
	before, _, err := mongo.LoadPlannerSettings(ctx, owner)
	if err != nil {
		t.Fatalf("LoadPlannerSettings: %v", err)
	}

	added := append(models.DefaultExtrasCategories(),
		models.ExtraCategory{ID: "courier", Label: "Courier"})
	stored, err := mongo.UpdatePlannerSettings(ctx, owner,
		planner.SettingsUpdate{ExtrasCategories: &added},
		models.MetaData{ClientID: "tab-1"}, now.Add(time.Minute))
	if err != nil {
		t.Fatalf("UpdatePlannerSettings: %v", err)
	}

	if len(stored.ExtrasCategories) != len(added) {
		t.Errorf("categories = %d, want the %d written", len(stored.ExtrasCategories), len(added))
	}
	if stored.DefaultMaterialEfficiencyValue != 7 {
		t.Errorf("ME = %d, want the 7 the update did not name", stored.DefaultMaterialEfficiencyValue)
	}
	if stored.MetaData.Revision != before.MetaData.Revision+1 {
		t.Errorf("version = %d, want %d — the write counts itself",
			stored.MetaData.Revision, before.MetaData.Revision+1)
	}
	if stored.MetaData.ClientID != "tab-1" {
		t.Errorf("clientID = %q, want the writing tab's", stored.MetaData.ClientID)
	}
	if !stored.MetaData.LastModified.After(before.MetaData.LastModified) {
		t.Error("the realtime cursor did not move")
	}
	if stored.MetaData.Owner != owner {
		t.Errorf("owner = %+v, want %+v", stored.MetaData.Owner, owner)
	}
}

func TestLive_updatePlannerSettings_refusesAPlannerThatDoesNotExist(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	categories := models.DefaultExtrasCategories()
	_, err := mongo.UpdatePlannerSettings(ctx,
		models.AccountOwner(plannerScratchAccount+"-missing"),
		planner.SettingsUpdate{ExtrasCategories: &categories},
		models.MetaData{}, time.Now().UTC())
	if !errors.Is(err, mongodriver.ErrNoDocuments) {
		t.Fatalf("err = %v, want mongo.ErrNoDocuments", err)
	}
}
