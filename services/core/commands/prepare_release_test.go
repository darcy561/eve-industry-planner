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

// stepIndex is the position of a named step, so an ordering test names what it
// means rather than a number that moves when a step is inserted.
func stepIndex(t *testing.T, version, name string) int {
	t.Helper()
	for _, rel := range releases {
		if rel.version != version {
			continue
		}
		for i, step := range rel.steps {
			if step.name == name {
				return i
			}
		}
	}
	t.Fatalf("release %s has no step %q", version, name)
	return -1
}

// The owner stamp writes the field every step after it filters on. Those steps
// do not fail without it — they match nothing, report zero, and let the release
// finish green having migrated nothing.
func TestOwnerStampRunsBeforeTheStepsThatFilterOnIt(t *testing.T) {
	t.Parallel()

	stamp := stepIndex(t, "0.9.0", "stamp the owner onto every scoped document")
	for _, dependent := range []string{
		"stamp extras category labels onto jobs",
		"queue every account for rebuild",
	} {
		if at := stepIndex(t, "0.9.0", dependent); at < stamp {
			t.Errorf("%q runs at %d, before the owner stamp at %d", dependent, at, stamp)
		}
	}
}

// Schema maintenance is first because the steps after it stamp the current
// version onto documents they touch.
func TestSchemaMaintenanceRunsFirst(t *testing.T) {
	t.Parallel()

	if at := stepIndex(t, "0.9.0", "complete outstanding schema maintenance"); at != 0 {
		t.Errorf("schema maintenance runs at %d, want first", at)
	}
}

// A step the rest read the output of must stop the release when it fails.
// Carrying on is what turns one failed step into a green release that did
// nothing.
func TestStepsOthersDependOnAreRequired(t *testing.T) {
	t.Parallel()

	want := map[string]bool{
		"complete outstanding schema maintenance":    true,
		"stamp the owner onto every scoped document": true,
	}
	for _, rel := range releases {
		for _, step := range rel.steps {
			if want[step.name] && !step.required {
				t.Errorf("step %q is a prerequisite but is not marked required", step.name)
			}
		}
	}
}

// The pre-release copy is what an operator falls back to, so it is taken while
// the documents still hold everything the previous release read. Dropping the
// retired fields first would copy documents already stripped of them.
func TestRetiredFieldsAreDroppedAfterTheSnapshot(t *testing.T) {
	t.Parallel()

	snapshot := stepIndex(t, "0.9.0", "copy the statistics documents before the rebuild")
	drop := stepIndex(t, "0.9.0", "drop retired statistics fields")
	if drop < snapshot {
		t.Errorf("retired fields are dropped at %d, before the snapshot at %d — the copy would miss them", drop, snapshot)
	}
}
