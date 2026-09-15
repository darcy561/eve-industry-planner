package commands

import (
	"context"
	"strings"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/models/planner"
	"eve-industry-planner/shared/stackservices"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const extrasScratchAccount = "eip-parity-release-extras"

// The state this step exists for: a planner whose settings were seeded at one
// login, and an account that added a category at a later one. The planner is
// what every picker now reads, so the later category has to reach it.
// Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_backfillPlannerExtrasCategories_movesWhatTheAccountAddedLater(t *testing.T) {
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

	// Seeded as first login would have done, from the defaults alone.
	seed := models.DefaultApplicationSettings(extrasScratchAccount, now)
	if _, _, err := mongo.ApplicationSettings.UpsertApplicationSettings(ctx, extrasScratchAccount, seed); err != nil {
		t.Fatalf("seed account settings: %v", err)
	}
	if err := mongo.EnsureAccountPlanner(ctx, extrasScratchAccount, now); err != nil {
		t.Fatalf("EnsureAccountPlanner: %v", err)
	}

	// The later login: a category added to the account, which the insert-only
	// planner seed never picks up.
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
	if _, err := backfillPlannerExtrasCategories(ctx, clients, false); err != nil {
		t.Fatalf("backfillPlannerExtrasCategories: %v", err)
	}

	after, _, err := mongo.LoadPlannerSettings(ctx, owner)
	if err != nil {
		t.Fatalf("LoadPlannerSettings after the step: %v", err)
	}
	if !categoryPresent(after.ExtrasCategories, "courier") {
		t.Fatalf("categories = %+v, want the account's later addition among them",
			after.ExtrasCategories)
	}

	// Re-running is what an operator does after a failed window, and by then
	// members may have edited the planner's own list.
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
	if _, err := backfillPlannerExtrasCategories(ctx, clients, false); err != nil {
		t.Fatalf("second backfillPlannerExtrasCategories: %v", err)
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

// An account whose planner could not be written is counted and stepped over: the
// step that gives every account its planner runs first, and the release's own
// gate is what refuses a run that left work undone.
// Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_backfillPlannerExtrasCategories_reportsAnAccountWithNoPlanner(t *testing.T) {
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

	report, err := backfillPlannerExtrasCategories(ctx, &stackservices.Clients{Mongo: mongo}, false)
	if err != nil {
		t.Fatalf("backfillPlannerExtrasCategories: %v", err)
	}
	if !strings.Contains(report, "have no planner settings") {
		t.Fatalf("report = %q, want it to name the account it could not move", report)
	}
	if _, seeded, err := mongo.LoadPlannerSettings(ctx, owner); err != nil || seeded {
		t.Fatalf("settings seeded = %v (err %v), want the step to have written nothing", seeded, err)
	}
}

// A dry run reports the work the real run would do and writes none of it.
// Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_backfillPlannerExtrasCategories_dryRunWritesNothing(t *testing.T) {
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
	dry, err := backfillPlannerExtrasCategories(ctx, clients, true)
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
