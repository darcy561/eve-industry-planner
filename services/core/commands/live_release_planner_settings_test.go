package commands

import (
	"context"
	"strings"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/models/planner"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/stackservices"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const extrasScratchAccount = "eip-parity-release-extras"

func TestLive_backfillPlannerSettings_extras_movesWhatTheAccountAddedLater(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	owner := models.AccountOwner(extrasScratchAccount)
	now := time.Now().UTC()

	t.Cleanup(func() {
		cleanupCtx, cancelCleanup := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancelCleanup()
		_, _ = mongo.PlannerSettings.Collection().DeleteOne(cleanupCtx, bson.M{"_id": owner.Key()})
		_, _ = mongo.Planners.Collection().DeleteOne(cleanupCtx, bson.M{"_id": owner.Key()})
		_, _ = mongo.ApplicationSettings.Collection().DeleteOne(cleanupCtx, bson.M{"_id": extrasScratchAccount})
	})

	seed := models.DefaultApplicationSettings(extrasScratchAccount, now)
	if _, _, err := mongo.ApplicationSettings.UpsertApplicationSettings(ctx, extrasScratchAccount, seed); err != nil {
		t.Fatalf("seed account settings: %v", err)
	}
	if err := mongo.EnsureAccountPlanner(ctx, extrasScratchAccount, now); err != nil {
		t.Fatalf("EnsureAccountPlanner: %v", err)
	}

	added := append(models.DefaultExtrasCategories(),
		models.ExtraCategory{ID: "courier", Label: "Courier"})
	seed.ExtrasCategories = added
	if _, _, err := mongo.ApplicationSettings.UpsertApplicationSettings(ctx, extrasScratchAccount, seed); err != nil {
		t.Fatalf("add a category to the account: %v", err)
	}

	before, _, err := mongo.LoadPlannerSettings(ctx, owner)
	if err != nil {
		t.Fatalf("LoadPlannerSettings: %v", err)
	}
	if categoryPresent(before.ExtrasCategories, "courier") {
		t.Fatal("the planner already holds the category, so this test proves nothing")
	}

	clients := &stackservices.Clients{Mongo: mongo}
	if _, err := backfillPlannerSettingsFrom(ctx, clients, nil, false); err != nil {
		t.Fatalf("backfillPlannerSettingsFrom: %v", err)
	}

	after, _, err := mongo.LoadPlannerSettings(ctx, owner)
	if err != nil {
		t.Fatalf("LoadPlannerSettings after the step: %v", err)
	}
	if !categoryPresent(after.ExtrasCategories, "courier") {
		t.Fatalf("categories = %+v, want the account's later addition among them",
			after.ExtrasCategories)
	}

	edited := make([]models.ExtraCategory, len(after.ExtrasCategories))
	copy(edited, after.ExtrasCategories)
	for i := range edited {
		if edited[i].ID == "1" {
			edited[i].Deleted = true
		}
	}
	if _, err := mongo.UpdatePlannerSettings(ctx, owner,
		planner.SettingsUpdate{ExtrasCategories: &edited},
		models.MetaData{}, now.Add(time.Minute)); err != nil {
		t.Fatalf("a member edits the planner's list: %v", err)
	}
	if _, err := backfillPlannerSettingsFrom(ctx, clients, nil, false); err != nil {
		t.Fatalf("second backfillPlannerSettingsFrom: %v", err)
	}
	again, _, err := mongo.LoadPlannerSettings(ctx, owner)
	if err != nil {
		t.Fatalf("LoadPlannerSettings after the re-run: %v", err)
	}
	for _, category := range again.ExtrasCategories {
		if category.ID == "1" && !category.Deleted {
			t.Error("a re-run undid a category the planner's members had deleted")
		}
	}
}

func categoryPresent(categories []models.ExtraCategory, id string) bool {
	for _, category := range categories {
		if category.ID == id {
			return true
		}
	}
	return false
}

func TestLive_backfillPlannerSettings_extras_reportsAnAccountWithNoPlanner(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	account := extrasScratchAccount + "-no-planner"
	owner := models.AccountOwner(account)

	t.Cleanup(func() {
		cleanupCtx, cancelCleanup := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancelCleanup()
		_, _ = mongo.ApplicationSettings.Collection().DeleteOne(cleanupCtx, bson.M{"_id": account})
		_, _ = mongo.PlannerSettings.Collection().DeleteOne(cleanupCtx, bson.M{"_id": owner.Key()})
	})

	settings := models.DefaultApplicationSettings(account, time.Now().UTC())
	settings.ExtrasCategories = append(models.DefaultExtrasCategories(),
		models.ExtraCategory{ID: "courier", Label: "Courier"})
	if _, _, err := mongo.ApplicationSettings.UpsertApplicationSettings(ctx, account, settings); err != nil {
		t.Fatalf("seed account settings: %v", err)
	}

	report, err := backfillPlannerSettingsFrom(ctx, &stackservices.Clients{Mongo: mongo}, nil, false)
	if err != nil {
		t.Fatalf("backfillPlannerSettingsFrom: %v", err)
	}
	if !strings.Contains(report, "have no planner settings") {
		t.Fatalf("report = %q, want it to name the account it could not move", report)
	}
	if _, seeded, err := mongo.LoadPlannerSettings(ctx, owner); err != nil || seeded {
		t.Fatalf("settings seeded = %v (err %v), want the step to have written nothing", seeded, err)
	}
}

func TestLive_backfillPlannerSettings_extras_dryRunWritesNothing(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	account := extrasScratchAccount + "-dry"
	owner := models.AccountOwner(account)
	now := time.Now().UTC()

	t.Cleanup(func() {
		cleanupCtx, cancelCleanup := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancelCleanup()
		_, _ = mongo.ApplicationSettings.Collection().DeleteOne(cleanupCtx, bson.M{"_id": account})
		_, _ = mongo.PlannerSettings.Collection().DeleteOne(cleanupCtx, bson.M{"_id": owner.Key()})
		_, _ = mongo.Planners.Collection().DeleteOne(cleanupCtx, bson.M{"_id": owner.Key()})
	})

	seed := models.DefaultApplicationSettings(account, now)
	if _, _, err := mongo.ApplicationSettings.UpsertApplicationSettings(ctx, account, seed); err != nil {
		t.Fatalf("seed account settings: %v", err)
	}
	if err := mongo.EnsureAccountPlanner(ctx, account, now); err != nil {
		t.Fatalf("EnsureAccountPlanner: %v", err)
	}
	seed.ExtrasCategories = append(models.DefaultExtrasCategories(),
		models.ExtraCategory{ID: "courier", Label: "Courier"})
	if _, _, err := mongo.ApplicationSettings.UpsertApplicationSettings(ctx, account, seed); err != nil {
		t.Fatalf("add a category to the account: %v", err)
	}

	clients := &stackservices.Clients{Mongo: mongo}
	dry, err := backfillPlannerSettingsFrom(ctx, clients, nil, true)
	if err != nil {
		t.Fatalf("dry run: %v", err)
	}
	if !strings.Contains(dry, "would move onto") {
		t.Errorf("report = %q, want it to say the work is not done", dry)
	}

	after, _, err := mongo.LoadPlannerSettings(ctx, owner)
	if err != nil {
		t.Fatalf("LoadPlannerSettings: %v", err)
	}
	if categoryPresent(after.ExtrasCategories, "courier") {
		t.Fatal("the dry run wrote the category it only meant to count")
	}
}

const reprocessingScratchAccount = "eip-parity-release-reprocessing"

func seedLegacyReprocessingAccount(t *testing.T, mongo *eipmongo.Mongo, account string, preferCompressed, sellExcess bool) (models.Owner, string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	owner := models.AccountOwner(account)
	copyName := "eip_parity_pre_release_" + account
	drop := func() {
		dropCtx, dropCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer dropCancel()
		_, _ = mongo.ApplicationSettings.Collection().DeleteOne(dropCtx, bson.M{"_id": account})
		_, _ = mongo.PlannerSettings.Collection().DeleteOne(dropCtx, bson.M{"_id": owner.Key()})
		_, _ = mongo.Planners.Collection().DeleteOne(dropCtx, bson.M{"_id": owner.Key()})
		_ = mongo.Coll(copyName).Drop(dropCtx)
		_, _ = mongo.Coll(releaseBackupsCollection).DeleteOne(dropCtx, bson.M{"_id": backupRecordID(account, eipmongo.CollectionAccountSettings)})
	}
	drop()
	t.Cleanup(drop)

	now := time.Now().UTC()
	if _, _, err := mongo.ApplicationSettings.UpsertApplicationSettings(ctx, account, models.DefaultApplicationSettings(account, now)); err != nil {
		t.Fatalf("seed account settings: %v", err)
	}
	if err := mongo.EnsureAccountPlanner(ctx, account, now); err != nil {
		t.Fatalf("EnsureAccountPlanner: %v", err)
	}
	retired := bson.M{
		"reprocessingSettings.preferCompressed":           preferCompressed,
		"reprocessingSettings.sellExcessMineralTypes":     sellExcess,
		"reprocessingSettings.compressionBonusMultiplier": 0.25,
		"reprocessingSettings.valueMultiplier":            2.0,
		"reprocessingSettings.wastePenaltyMultiplier":     0.1,
	}
	if _, err := mongo.ApplicationSettings.Collection().UpdateByID(ctx, account, bson.M{"$set": retired}); err != nil {
		t.Fatalf("write the retired fields: %v", err)
	}
	var stored bson.M
	if err := mongo.ApplicationSettings.Collection().FindOne(ctx, bson.M{"_id": account}).Decode(&stored); err != nil {
		t.Fatalf("read the account back: %v", err)
	}
	if _, err := mongo.Coll(copyName).InsertOne(ctx, stored); err != nil {
		t.Fatalf("copy the account: %v", err)
	}
	return owner, copyName
}

func TestLive_backfillPlannerSettings_carriesTheAccountsReprocessingChoicesOntoItsPlanner(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	owner, copyName := seedLegacyReprocessingAccount(t, mongo, reprocessingScratchAccount, false, true)
	if _, err := mongo.ApplicationSettings.Collection().UpdateByID(ctx, reprocessingScratchAccount,
		bson.M{"$unset": bson.M{"reprocessingSettings.preferCompressed": "", "reprocessingSettings.sellExcessMineralTypes": ""}}); err != nil {
		t.Fatalf("drop the fields from the live document, as schema maintenance does: %v", err)
	}

	legacy, err := readLegacyReprocessing(ctx, mongo.Coll(copyName))
	if err != nil {
		t.Fatalf("readLegacyReprocessing: %v", err)
	}
	clients := &stackservices.Clients{Mongo: mongo}
	if _, err := backfillPlannerSettingsFrom(ctx, clients, legacy, false); err != nil {
		t.Fatalf("backfillPlannerSettingsFrom: %v", err)
	}

	after, _, err := mongo.LoadPlannerSettings(ctx, owner)
	if err != nil {
		t.Fatalf("LoadPlannerSettings: %v", err)
	}
	if got := after.ReprocessingSettings; got.CompressedOre != planner.CompressedOreAllow || !got.CountLeftoversAsSold {
		t.Fatalf("planner reprocessing = %+v, want the account's choices carried over", got)
	}

	var account bson.M
	if err := mongo.ApplicationSettings.Collection().FindOne(ctx, bson.M{"_id": reprocessingScratchAccount}).Decode(&account); err != nil {
		t.Fatalf("read the account: %v", err)
	}
	reprocessing, _ := account["reprocessingSettings"].(bson.M)
	for _, field := range retiredReprocessingFields {
		if _, present := reprocessing[field]; present {
			t.Errorf("the account still holds %s", field)
		}
	}

	own := after.ReprocessingSettings
	own.CompressedOre = planner.CompressedOreAvoid
	if _, err := mongo.UpdatePlannerSettings(ctx, owner, planner.SettingsUpdate{ReprocessingSettings: &own},
		models.MetaData{}, time.Now().UTC().Add(time.Minute)); err != nil {
		t.Fatalf("a member changes the planner's settings: %v", err)
	}
	if _, err := backfillPlannerSettingsFrom(ctx, clients, legacy, false); err != nil {
		t.Fatalf("second backfillPlannerSettingsFrom: %v", err)
	}
	again, _, err := mongo.LoadPlannerSettings(ctx, owner)
	if err != nil {
		t.Fatalf("LoadPlannerSettings after the re-run: %v", err)
	}
	if again.ReprocessingSettings.CompressedOre != planner.CompressedOreAvoid {
		t.Error("a re-run replaced the choice the planner's members had made")
	}
}

func TestLive_backfillPlannerSettings_readsTheReleasesCopyAndRefusesARunWithout(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	release := reprocessingScratchAccount + "-copy"
	_, copyName := seedLegacyReprocessingAccount(t, mongo, release, false, false)

	if _, err := preReleaseAccountSettings(ctx, mongo, release, false); err == nil {
		t.Fatal("a real run with no copy recorded did not refuse")
	}
	live, err := preReleaseAccountSettings(ctx, mongo, release, true)
	if err != nil || live.Name() != eipmongo.CollectionAccountSettings {
		t.Fatalf("dry run read %v (err %v), want the collection itself", live, err)
	}

	if _, err := mongo.Coll(releaseBackupsCollection).InsertOne(ctx, backupRecord{
		ID: backupRecordID(release, eipmongo.CollectionAccountSettings), Release: release,
		Collection: eipmongo.CollectionAccountSettings, Documents: 1, TakenAt: time.Now().UTC(),
	}); err != nil {
		t.Fatalf("record a copy: %v", err)
	}
	t.Cleanup(func() {
		dropCtx, dropCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer dropCancel()
		_ = mongo.Coll(eipmongo.CollectionAccountSettings + backupSuffix(release)).Drop(dropCtx)
	})
	var stored bson.M
	if err := mongo.Coll(copyName).FindOne(ctx, bson.M{"_id": release}).Decode(&stored); err != nil {
		t.Fatalf("read the copy: %v", err)
	}
	if _, err := mongo.Coll(eipmongo.CollectionAccountSettings+backupSuffix(release)).InsertOne(ctx, stored); err != nil {
		t.Fatalf("write the release's copy: %v", err)
	}

	source, err := preReleaseAccountSettings(ctx, mongo, release, false)
	if err != nil {
		t.Fatalf("preReleaseAccountSettings: %v", err)
	}
	legacy, err := readLegacyReprocessing(ctx, source)
	if err != nil {
		t.Fatalf("readLegacyReprocessing: %v", err)
	}
	if got, ok := legacy[release]; !ok || got.PreferCompressed == nil || *got.PreferCompressed {
		t.Fatalf("legacy = %+v, want the copy's preferCompressed false", legacy[release])
	}
}

func TestLive_backfillPlannerSettings_reprocessingDryRunWritesNothing(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	account := reprocessingScratchAccount + "-dry"
	owner, _ := seedLegacyReprocessingAccount(t, mongo, account, false, true)
	legacy, err := readLegacyReprocessing(ctx, mongo.ApplicationSettings.Collection())
	if err != nil {
		t.Fatalf("readLegacyReprocessing: %v", err)
	}

	report, err := backfillPlannerSettingsFrom(ctx, &stackservices.Clients{Mongo: mongo}, legacy, true)
	if err != nil {
		t.Fatalf("dry run: %v", err)
	}
	if !strings.Contains(report, "would be cleared of") {
		t.Errorf("report = %q, want it to say the work is not done", report)
	}

	after, _, err := mongo.LoadPlannerSettings(ctx, owner)
	if err != nil {
		t.Fatalf("LoadPlannerSettings: %v", err)
	}
	if after.ReprocessingSettings.CompressedOre != planner.CompressedOrePrefer {
		t.Error("the dry run wrote the planner's reprocessing settings")
	}
	count, err := mongo.ApplicationSettings.Collection().CountDocuments(ctx,
		bson.M{"_id": account, "reprocessingSettings.preferCompressed": bson.M{"$exists": true}})
	if err != nil || count != 1 {
		t.Fatalf("account still holding the retired fields = %d (err %v), want the dry run to leave them", count, err)
	}
}
