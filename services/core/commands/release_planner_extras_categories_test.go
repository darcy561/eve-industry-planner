package commands

import (
	"testing"

	"eve-industry-planner/shared/models"
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
	// A member's rename and a member's deletion both outrank the account's copy,
	// which is what makes the step safe to run more than once.
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

// Appending to a slice with spare capacity writes into the array the caller
// still holds — here, the categories decoded from the stored document.
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
