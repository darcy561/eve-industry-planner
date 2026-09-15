package commands

import (
	"context"
	"encoding/json"
	"slices"
	"strings"
	"testing"
	"time"

	"eve-industry-planner/core/changestream"
	"eve-industry-planner/core/primaryhandoff"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/plannersession"
	eipredis "eve-industry-planner/shared/redis"
	"eve-industry-planner/shared/stackservices"
	"eve-industry-planner/testing/redisfake"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestRetiredResumeTokenGroupsPicksGroupsThatNoLongerRun(t *testing.T) {
	t.Parallel()

	groups := []changestream.CollectionGroup{
		{ID: "account"}, {ID: "planner"}, {ID: "blueprints"},
	}
	stored := []string{
		"planner",
		"archive_and_stats",
		"account",
		"blueprints",
	}

	got := retiredResumeTokenGroups(stored, groups)

	want := []string{"archive_and_stats"}
	if !slices.Equal(got, want) {
		t.Fatalf("retired groups = %v, want %v", got, want)
	}
}

// Running the release against an environment that is already current has to be
// safe, so a store holding only live groups reports nothing to do.
func TestRetiredResumeTokenGroupsReportsNothingWhenCurrent(t *testing.T) {
	t.Parallel()

	groups := changestream.CollectionGroups()
	stored := make([]string, 0, len(groups))
	for _, group := range groups {
		stored = append(stored, group.ID)
	}

	if got := retiredResumeTokenGroups(stored, groups); len(got) != 0 {
		t.Fatalf("retired groups = %v, want none", got)
	}
}

func TestRetiredResumeTokenGroupsOrderIsStable(t *testing.T) {
	t.Parallel()

	groups := []changestream.CollectionGroup{{ID: "account"}}
	stored := []string{
		"zulu",
		"alpha",
		"account",
	}

	first := retiredResumeTokenGroups(stored, groups)
	slices.Reverse(stored)
	second := retiredResumeTokenGroups(stored, groups)

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

	if len(releaseTouchedCollections()) == 0 {
		t.Fatal("the release touches no collections")
	}
	seen := map[string]bool{}
	for _, name := range releaseTouchedCollections() {
		if name == "" {
			t.Error("a derived statistics collection has no name")
			continue
		}
		snapshot := name + backupSuffix(currentRelease)
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
	for _, name := range releaseTouchedCollections() {
		live[name] = true
	}
	for _, name := range releaseTouchedCollections() {
		if live[name+backupSuffix(currentRelease)] {
			t.Errorf("%q snapshots into %q, which this step also empties", name, name+backupSuffix(currentRelease))
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

	stamp := stepIndex(t, currentRelease, "stamp the owner onto every scoped document")
	for _, dependent := range []string{
		"stamp extras category labels onto jobs",
		"queue every account for rebuild",
	} {
		if at := stepIndex(t, currentRelease, dependent); at < stamp {
			t.Errorf("%q runs at %d, before the owner stamp at %d", dependent, at, stamp)
		}
	}
}

// The copy is first and required: every step after it writes, and a copy taken
// after a step ran is a copy of that step's output rather than of the state an
// operator would revert to.
func TestTheBackupRunsBeforeAnythingWrites(t *testing.T) {
	t.Parallel()

	if at := stepIndex(t, currentRelease, "copy every collection this release writes to"); at != 0 {
		t.Errorf("the backup runs at %d, want first", at)
	}
}

// Schema maintenance precedes every step that stamps the current version onto
// documents it touches.
func TestSchemaMaintenanceRunsBeforeTheStamps(t *testing.T) {
	t.Parallel()

	maintenance := stepIndex(t, currentRelease, "complete outstanding schema maintenance")
	if stamp := stepIndex(t, currentRelease, "stamp the owner onto every scoped document"); stamp < maintenance {
		t.Errorf("the owner stamp runs at %d, before schema maintenance at %d", stamp, maintenance)
	}
}

// Every collection any step or fan-out writes to is in the copy, and the copy
// is built from the lists those steps iterate rather than written out again.
func TestTheBackupCoversEveryCollectionAStepWritesTo(t *testing.T) {
	t.Parallel()

	touched := releaseTouchedCollections()
	for _, group := range [][]string{metaOwnerCollections, eipmongo.OwnerScopedIDCollections(), derivedStatisticsCollections, accountPlannerCollections} {
		for _, name := range group {
			if !slices.Contains(touched, name) {
				t.Errorf("%s is written by a step and not copied first", name)
			}
		}
	}
}

// A step the rest read the output of must stop the release when it fails.
// Carrying on is what turns one failed step into a green release that did
// nothing.
func TestStepsOthersDependOnAreRequired(t *testing.T) {
	t.Parallel()

	want := map[string]bool{
		"copy every collection this release writes to": true,
		"complete outstanding schema maintenance":      true,
		"stamp the owner onto every scoped document":   true,
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

	snapshot := stepIndex(t, currentRelease, "copy every collection this release writes to")
	drop := stepIndex(t, currentRelease, "drop retired statistics fields")
	if drop < snapshot {
		t.Errorf("retired fields are dropped at %d, before the snapshot at %d — the copy would miss them", drop, snapshot)
	}
}

// An operator reads the step's line to decide whether the window is safe to
// close, so a dry run must say what it would do rather than reporting nothing.
func TestRepairSessionGrantsReportsWhatItWouldRewrite(t *testing.T) {
	ctx := context.Background()
	rdb := redisfake.New(t)
	clients := &stackservices.Clients{Redis: eipredis.NewRedis(rdb.Client)}

	legacy, err := json.Marshal(map[string]any{
		"account_id": "acct-1",
		"grants":     map[string]any{"corporation_refs": []string{"corp_x"}},
		"sessions":   map[string]any{},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if err := rdb.Client.Set(ctx, plannersession.AccountSessionsKeyPrefix+"acct-1", legacy, time.Hour).Err(); err != nil {
		t.Fatalf("seed: %v", err)
	}

	dry, err := repairSessionGrants(ctx, clients, true)
	if err != nil {
		t.Fatalf("dry run: %v", err)
	}
	if !strings.Contains(dry, "would be rewritten") {
		t.Fatalf("dry run report = %q, want it to say what it would do", dry)
	}

	if _, err := repairSessionGrants(ctx, clients, false); err != nil {
		t.Fatalf("repair: %v", err)
	}

	// Re-running a release must report no work rather than rewriting again.
	again, err := repairSessionGrants(ctx, clients, false)
	if err != nil {
		t.Fatalf("second pass: %v", err)
	}
	if !strings.Contains(again, "1 scanned, 0 rewritten") {
		t.Fatalf("second pass report = %q, want it to report nothing rewritten", again)
	}
}

// The step reads and deletes real keys, so it is worth driving end to end: a
// group id the scan returns has to name the key the drop removes.
func TestDropRetiredResumeTokensRemovesOnlyRetiredGroups(t *testing.T) {
	ctx := context.Background()
	fake := redisfake.New(t)
	clients := &stackservices.Clients{Redis: eipredis.NewRedis(fake.Client)}

	live := changestream.CollectionGroups()[0].ID
	tokens := primaryhandoff.NewResumeTokens(clients.Redis)
	tokens.Save(ctx, live, bson.Raw{5, 0, 0, 0, 0})
	tokens.Save(ctx, "retired_group", bson.Raw{5, 0, 0, 0, 0})

	if _, err := dropRetiredResumeTokens(ctx, clients, false); err != nil {
		t.Fatalf("drop: %v", err)
	}

	if !fake.Server.Exists(primaryhandoff.ResumeTokenKey(live)) {
		t.Errorf("the live group %q lost its token", live)
	}
	if fake.Server.Exists(primaryhandoff.ResumeTokenKey("retired_group")) {
		t.Error("the retired group kept its token")
	}
}

// The planner steps insert documents into three collections, and a revert has to
// be able to take all three back out.
//
// Named here rather than derived: the collections come from what EnsurePlanner
// writes, which no exported list describes, so a fourth one added there has to be
// added here too — and this test is what says so.
func TestTheBackupCoversWhatThePlannerStepsCreate(t *testing.T) {
	t.Parallel()

	touched := releaseTouchedCollections()
	for _, name := range []string{
		eipmongo.CollectionPlanners,
		eipmongo.CollectionPlannerMemberships,
		eipmongo.CollectionPlannerSettings,
	} {
		if !slices.Contains(touched, name) {
			t.Errorf("%s is written by the planner backfill and not copied first, so a revert would leave what it created", name)
		}
	}
}
