package commands

import (
	"slices"
	"testing"

	"eve-industry-planner/core/changestream"
	"eve-industry-planner/core/primaryhandoff"
	"eve-industry-planner/shared/models"
)

func TestRetiredResumeTokenKeysPicksGroupsThatNoLongerRun(t *testing.T) {
	t.Parallel()

	groups := []changestream.CollectionGroup{
		{ID: "account"}, {ID: "planner"}, {ID: "blueprints"},
	}
	stored := []string{
		primaryhandoff.ResumeTokenKey("planner"),
		primaryhandoff.ResumeTokenKey("archive_and_stats"),
		primaryhandoff.ResumeTokenKey("account"),
		primaryhandoff.ResumeTokenKey("blueprints"),
	}

	got := retiredResumeTokenKeys(stored, groups)

	want := []string{primaryhandoff.ResumeTokenKey("archive_and_stats")}
	if !slices.Equal(got, want) {
		t.Fatalf("retired keys = %v, want %v", got, want)
	}
}

// Running the release against an environment that is already current has to be
// safe, so a store holding only live groups reports nothing to do.
func TestRetiredResumeTokenKeysReportsNothingWhenCurrent(t *testing.T) {
	t.Parallel()

	groups := changestream.CollectionGroups()
	stored := make([]string, 0, len(groups))
	for _, group := range groups {
		stored = append(stored, primaryhandoff.ResumeTokenKey(group.ID))
	}

	if got := retiredResumeTokenKeys(stored, groups); len(got) != 0 {
		t.Fatalf("retired keys = %v, want none", got)
	}
}

func TestRetiredResumeTokenKeysOrderIsStable(t *testing.T) {
	t.Parallel()

	groups := []changestream.CollectionGroup{{ID: "account"}}
	stored := []string{
		primaryhandoff.ResumeTokenKey("zulu"),
		primaryhandoff.ResumeTokenKey("alpha"),
		primaryhandoff.ResumeTokenKey("account"),
	}

	first := retiredResumeTokenKeys(stored, groups)
	slices.Reverse(stored)
	second := retiredResumeTokenKeys(stored, groups)

	if !slices.Equal(first, second) {
		t.Fatalf("order depends on the store's order: %v then %v", first, second)
	}
}

// The queue is keyed by owner, and a dispatch skips an id it cannot read back —
// so an entry left under an older key would never be dispatched and never
// cleared. The release drops them before re-queueing.
func TestUnaddressableQueueEntriesAreThoseThatNameNoOwner(t *testing.T) {
	t.Parallel()

	stored := []string{
		models.AccountStatsOwner("acct-1").Key(),
		"acct-2", // an older key: a bare account id with no kind
		models.StatsOwner{Kind: models.StatsOwnerCorporation, ID: "corp_56_JxK"}.Key(),
		"character:xyz", // a kind nothing can rebuild
	}

	var unaddressable []string
	for _, id := range stored {
		if _, err := models.ParseStatsOwnerKey(id); err != nil {
			unaddressable = append(unaddressable, id)
		}
	}

	want := []string{"acct-2", "character:xyz"}
	if !slices.Equal(unaddressable, want) {
		t.Fatalf("unaddressable = %v, want %v", unaddressable, want)
	}
}
