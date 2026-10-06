package commands

import (
	"testing"

	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/models/planner"
)

func TestMergeExtrasCategoriesKeepsWhatThePlannerHolds(t *testing.T) {
	t.Parallel()

	held := []models.ExtraCategory{
		{ID: "0", Label: "Unassigned"},
		{ID: "hauling", Label: "Hauling, renamed by a member"},
		{ID: "retired", Label: "Retired", Deleted: true},
	}
	account := []models.ExtraCategory{
		{ID: "0", Label: "Unassigned"},
		{ID: "hauling", Label: "Hauling"},
		{ID: "retired", Label: "Retired"},
		{ID: "courier", Label: "Courier"},
	}

	merged, added := mergeExtrasCategories(held, account)

	if added != 1 {
		t.Fatalf("added = %d, want only the category the planner was missing", added)
	}
	if got := merged[len(merged)-1]; got.ID != "courier" {
		t.Errorf("last category = %q, want the added one", got.ID)
	}
	if merged[1].Label != "Hauling, renamed by a member" {
		t.Errorf("label = %q, want the planner's own", merged[1].Label)
	}
	if !merged[2].Deleted {
		t.Error("a category the planner deleted came back")
	}
}

func TestMergeExtrasCategoriesAddsNothingTwice(t *testing.T) {
	t.Parallel()

	account := []models.ExtraCategory{
		{ID: "courier", Label: "Courier"},
		{ID: "courier", Label: "Courier again"},
		{ID: "", Label: "No id at all"},
	}

	merged, added := mergeExtrasCategories(models.DefaultExtrasCategories(), account)

	if added != 1 {
		t.Fatalf("added = %d, want one — a repeated id and an empty one are not categories", added)
	}
	if len(merged) != len(models.DefaultExtrasCategories())+1 {
		t.Errorf("merged = %d categories, want the defaults plus one", len(merged))
	}
}

func TestMergeExtrasCategoriesLeavesAPlannerThatIsAlreadyCurrent(t *testing.T) {
	t.Parallel()

	_, added := mergeExtrasCategories(models.DefaultExtrasCategories(), models.DefaultExtrasCategories())

	if added != 0 {
		t.Fatalf("added = %d, want none — a re-run writes nothing", added)
	}
}

func TestMergeExtrasCategoriesLeavesTheCallersSliceAlone(t *testing.T) {
	t.Parallel()

	held := make([]models.ExtraCategory, 2, 8)
	held[0] = models.ExtraCategory{ID: "0", Label: "Unassigned"}
	held[1] = models.ExtraCategory{ID: "5", Label: "Other"}

	merged, added := mergeExtrasCategories(held, []models.ExtraCategory{
		{ID: "courier", Label: "Courier"},
	})

	if added != 1 || len(merged) != 3 {
		t.Fatalf("merged %d categories after adding %d, want 3 and 1", len(merged), added)
	}
	if len(held) != 2 {
		t.Fatalf("the caller's slice grew to %d", len(held))
	}
	if cap(held) > 2 && held[:3][2].ID != "" {
		t.Errorf("the merge wrote %q into the caller's backing array", held[:3][2].ID)
	}
}

func TestConvertLegacyReprocessingCarriesTheAccountsChoices(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name     string
		account  legacyReprocessing
		wantOre  string
		wantSold bool
	}{
		{"preferring compressed ore and keeping leftovers", legacyReprocessing{new(true), new(false)}, planner.CompressedOrePrefer, false},
		{"not preferring compressed ore", legacyReprocessing{new(false), new(false)}, planner.CompressedOreAllow, false},
		{"selling leftovers", legacyReprocessing{new(true), new(true)}, planner.CompressedOrePrefer, true},
		{"holding neither field", legacyReprocessing{}, planner.CompressedOrePrefer, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := convertLegacyReprocessing(tc.account)
			if got.CompressedOre != tc.wantOre || got.CountLeftoversAsSold != tc.wantSold {
				t.Fatalf("converted %+v, want compressed ore %q and leftovers sold %v", got, tc.wantOre, tc.wantSold)
			}
			if err := got.Validate(); err != nil {
				t.Fatalf("converted settings refused: %v", err)
			}
		})
	}
}

func TestReprocessingForLeavesAPlannersOwnChoice(t *testing.T) {
	t.Parallel()

	own := planner.DefaultReprocessingSettings()
	own.CompressedOre = planner.CompressedOreAvoid

	if _, change := reprocessingFor(own, legacyReprocessing{new(false), new(true)}, true); change {
		t.Fatal("a planner's own choice was replaced by the account's")
	}
}

func TestReprocessingForTakesTheAccountsChoiceOverTheSeededDefaults(t *testing.T) {
	t.Parallel()

	got, change := reprocessingFor(planner.DefaultReprocessingSettings(), legacyReprocessing{new(false), new(true)}, true)
	if !change || got.CompressedOre != planner.CompressedOreAllow || !got.CountLeftoversAsSold {
		t.Fatalf("got %+v (change %v), want the account's choices", got, change)
	}
}

func TestReprocessingForReplacesSettingsInTheRetiredShape(t *testing.T) {
	t.Parallel()

	got, change := reprocessingFor(planner.ReprocessingSettings{}, legacyReprocessing{}, false)
	if !change || !sameReprocessing(got, planner.DefaultReprocessingSettings()) {
		t.Fatalf("got %+v (change %v), want the defaults written", got, change)
	}
}

func TestReprocessingForWritesNothingTwice(t *testing.T) {
	t.Parallel()

	account := legacyReprocessing{new(false), new(true)}
	first, _ := reprocessingFor(planner.DefaultReprocessingSettings(), account, true)
	if _, change := reprocessingFor(first, account, true); change {
		t.Fatal("a re-run changed settings it had already written")
	}
	if _, change := reprocessingFor(planner.DefaultReprocessingSettings(), legacyReprocessing{new(true), new(false)}, true); change {
		t.Fatal("an account whose choices are the defaults changed a planner on the defaults")
	}
}
