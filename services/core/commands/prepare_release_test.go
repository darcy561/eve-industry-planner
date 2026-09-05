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
		models.AccountOwner("acct-1").Key(),
		"acct-2", // an older key: a bare account id with no kind
		models.Owner{Kind: models.OwnerCorporation, ID: "corp_56_JxK"}.Key(),
		"character:xyz", // a kind nothing can rebuild
	}

	var unaddressable []string
	for _, id := range stored {
		if _, err := models.ParseOwnerKey(id); err != nil {
			unaddressable = append(unaddressable, id)
		}
	}

	want := []string{"acct-2", "character:xyz"}
	if !slices.Equal(unaddressable, want) {
		t.Fatalf("unaddressable = %v, want %v", unaddressable, want)
	}
}

// The release catalogue is what a deploy runs, so a malformed entry is a
// production problem rather than a compile error. Each is checked for the two
// things that would make it useless: a version to report it under, and a step
// with something to run.
func TestReleasesCatalogIsValid(t *testing.T) {
	t.Parallel()

	seen := map[string]bool{}
	for _, rel := range releases {
		if rel.version == "" {
			t.Error("a release carries no version")
		}
		if seen[rel.version] {
			t.Errorf("release %q is declared twice — its steps would run twice", rel.version)
		}
		seen[rel.version] = true

		if len(rel.steps) == 0 {
			t.Errorf("release %q declares no steps", rel.version)
		}
		names := map[string]bool{}
		for _, step := range rel.steps {
			if step.name == "" {
				t.Errorf("release %q has a step with no name", rel.version)
			}
			if step.run == nil {
				t.Errorf("release %q step %q has nothing to run", rel.version, step.name)
			}
			if names[step.name] {
				t.Errorf("release %q declares step %q twice", rel.version, step.name)
			}
			names[step.name] = true
		}
	}
}

// The snapshot's name is derived from the live collection rather than written
// out, so a collection rename carries its snapshot with it rather than leaving
// one named after a collection that no longer exists.
func TestSnapshotNamesFollowTheirCollections(t *testing.T) {
	t.Parallel()

	if len(derivedStatisticsCollections) == 0 {
		t.Fatal("no derived statistics collections declared")
	}
	seen := map[string]bool{}
	for _, name := range derivedStatisticsCollections {
		if name == "" {
			t.Error("a derived statistics collection has no name")
			continue
		}
		snapshot := name + preReleaseSnapshotSuffix
		if snapshot == name {
			t.Errorf("%q would snapshot over itself", name)
		}
		if seen[snapshot] {
			t.Errorf("%q shares a snapshot with another collection", name)
		}
		seen[snapshot] = true
	}
}

// A snapshot must not be one of the collections being emptied, or the step would
// set a collection aside into one it is about to clear.
func TestNoCollectionIsItsOwnSnapshotTarget(t *testing.T) {
	t.Parallel()

	live := map[string]bool{}
	for _, name := range derivedStatisticsCollections {
		live[name] = true
	}
	for _, name := range derivedStatisticsCollections {
		if live[name+preReleaseSnapshotSuffix] {
			t.Errorf("%q snapshots into %q, which this step also empties", name, name+preReleaseSnapshotSuffix)
		}
	}
}
