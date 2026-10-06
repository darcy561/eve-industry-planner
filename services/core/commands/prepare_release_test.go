package commands

import (
	"context"
	"encoding/json"
	"os"
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

func TestUnaddressableQueueEntriesAreThoseThatNameNoOwner(t *testing.T) {
	t.Parallel()

	stored := []string{
		models.AccountOwner("acct-1").Key(),
		"acct-2",
		models.Owner{Kind: models.OwnerCorporation, ID: "corp_56_JxK"}.Key(),
		"character:xyz",
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

func TestTheMarketLaneSeedRunsAfterEveryWholeSettingsWrite(t *testing.T) {
	t.Parallel()

	seed := stepIndex(t, currentRelease, "give every settings document an empty market lane")
	for _, wholeWrite := range []string{
		"complete outstanding schema maintenance",
		"seed each account's buying and selling pricing defaults",
	} {
		if at := stepIndex(t, currentRelease, wholeWrite); at > seed {
			t.Errorf("%q runs at %d, after the market lane seed at %d — it would leave a null behind",
				wholeWrite, at, seed)
		}
	}
}

func TestTheMarketMoveRunsAfterTheStructureFold(t *testing.T) {
	t.Parallel()

	move := stepIndex(t, currentRelease, "move every saved market onto its own lane")
	for _, before := range []string{
		"fold custom structures into one array",
		"fold rig slots onto every saved structure",
	} {
		if at := stepIndex(t, currentRelease, before); at > move {
			t.Errorf("%q runs at %d, after the market move at %d", before, at, move)
		}
	}
}

func TestTheBackupRunsBeforeAnythingWrites(t *testing.T) {
	t.Parallel()

	backup := stepIndex(t, currentRelease, "copy every collection this release writes to")
	readOnlyBefore := map[string]bool{
		"check the owner-scoped id rewrite has finished": true,
	}
	for _, rel := range releases {
		if rel.version != currentRelease {
			continue
		}
		for i, step := range rel.steps {
			if i < backup && !readOnlyBefore[step.name] {
				t.Errorf("step %q runs at %d, before the backup at %d", step.name, i, backup)
			}
		}
	}
}

func TestSchemaMaintenanceRunsBeforeTheStamps(t *testing.T) {
	t.Parallel()

	maintenance := stepIndex(t, currentRelease, "complete outstanding schema maintenance")
	if stamp := stepIndex(t, currentRelease, "stamp the owner onto every scoped document"); stamp < maintenance {
		t.Errorf("the owner stamp runs at %d, before schema maintenance at %d", stamp, maintenance)
	}
}

func TestTheReshapeRunsAfterTheLabelStampAndBeforeTheRebuild(t *testing.T) {
	t.Parallel()

	labels := stepIndex(t, currentRelease, "stamp extras category labels onto jobs")
	reshape := stepIndex(t, currentRelease, "reshape every job document")
	rebuild := stepIndex(t, currentRelease, "queue every account for rebuild")

	if reshape < labels {
		t.Errorf("the reshape runs at %d, before the label stamp at %d", reshape, labels)
	}
	if reshape > rebuild {
		t.Errorf("the reshape runs at %d, after the rebuild is queued at %d", reshape, rebuild)
	}
}

func TestTheBackupCoversEveryCollectionAStepWritesTo(t *testing.T) {
	t.Parallel()

	touched := releaseTouchedCollections()
	for _, group := range [][]string{metaOwnerCollections, eipmongo.OwnerScopedIDCollections(), derivedStatisticsCollections, accountPlannerCollections, reshapeJobCollections} {
		for _, name := range group {
			if !slices.Contains(touched, name) {
				t.Errorf("%s is written by a step and not copied first", name)
			}
		}
	}
}

func TestStepsOthersDependOnAreRequired(t *testing.T) {
	t.Parallel()

	want := map[string]bool{
		"copy every collection this release writes to": true,
		"complete outstanding schema maintenance":      true,
		"stamp the owner onto every scoped document":   true,
		"reshape every job document":                   true,
	}
	for _, rel := range releases {
		for _, step := range rel.steps {
			if want[step.name] && !step.required {
				t.Errorf("step %q is a prerequisite but is not marked required", step.name)
			}
		}
	}
}

func TestRetiredFieldsAreDroppedAfterTheSnapshot(t *testing.T) {
	t.Parallel()

	snapshot := stepIndex(t, currentRelease, "copy every collection this release writes to")
	drop := stepIndex(t, currentRelease, "drop retired statistics fields")
	if drop < snapshot {
		t.Errorf("retired fields are dropped at %d, before the snapshot at %d — the copy would miss them", drop, snapshot)
	}
}

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

	again, err := repairSessionGrants(ctx, clients, false)
	if err != nil {
		t.Fatalf("second pass: %v", err)
	}
	if !strings.Contains(again, "1 scanned, 0 rewritten") {
		t.Fatalf("second pass report = %q, want it to report nothing rewritten", again)
	}
}

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

func TestTheStructureFoldRunsAfterThePlannerDocumentsExist(t *testing.T) {
	t.Parallel()

	fold := stepIndex(t, currentRelease, "fold custom structures into one array")
	for _, earlier := range []string{
		"give every account its planner",
		"move each account's planner settings onto its planner",
	} {
		if at := stepIndex(t, currentRelease, earlier); at > fold {
			t.Errorf("%q runs at %d, after the structure fold at %d", earlier, at, fold)
		}
	}
}

func TestTheStructureFoldCoversBothSettingsCollections(t *testing.T) {
	t.Parallel()

	for _, want := range []string{eipmongo.CollectionAccountSettings, eipmongo.CollectionPlannerSettings} {
		if !slices.Contains(settingsDocumentCollections, want) {
			t.Errorf("%q is not folded", want)
		}
	}
}

func TestTheStructureFoldsCollectionsAreBackedUp(t *testing.T) {
	t.Parallel()

	copied := releaseTouchedCollections()
	for _, name := range settingsDocumentCollections {
		if !slices.Contains(copied, name) {
			t.Errorf("%q is folded but never copied, so a revert cannot put it back", name)
		}
	}
}

func TestTheReleaseAsksForWhatItsStepsPublishOn(t *testing.T) {
	t.Parallel()

	if _, err := rebuildCurrentSDEVersion(t.Context(), &stackservices.Clients{}, true); err == nil {
		t.Fatal("the SDE rebuild no longer needs a NATS handle; this test and the connect fallback can go")
	}

	source, err := os.ReadFile("prepare_release.go")
	if err != nil {
		t.Fatalf("read prepare_release.go: %v", err)
	}
	if !strings.Contains(string(source), "Mongo: true, Redis: true, NATS: true") {
		t.Error("prepareRelease does not request NATS, so the SDE rebuild step cannot succeed")
	}
}

func TestTheReleaseStillRunsWithoutABroker(t *testing.T) {
	t.Parallel()

	source, err := os.ReadFile("prepare_release.go")
	if err != nil {
		t.Fatalf("read prepare_release.go: %v", err)
	}
	if !strings.Contains(string(source), "stackservices.Services{Mongo: true, Redis: true})") {
		t.Error("no fallback connect: an unreachable broker would now fail the release before its first step")
	}
}

func TestTheOwnerScopedIDWarningComesFirst(t *testing.T) {
	t.Parallel()

	warning := stepIndex(t, currentRelease, "check the owner-scoped id rewrite has finished")
	if warning != 0 {
		t.Errorf("the rewrite warning runs at %d, not first", warning)
	}
	if gate := stepIndex(t, currentRelease, "verify every owner-scoped id carries its owner"); gate < warning {
		t.Errorf("the gate runs at %d, before the warning at %d", gate, warning)
	}
}

func TestTheOwnerScopedIDWarningDoesNotStopTheRelease(t *testing.T) {
	t.Parallel()

	for _, rel := range releases {
		for _, step := range rel.steps {
			if step.name == "check the owner-scoped id rewrite has finished" && step.required {
				t.Error("the rewrite warning is marked required; it would stop the release before the backup")
			}
		}
	}
}

func TestTheRigFoldRunsAfterTheJobReshape(t *testing.T) {
	t.Parallel()

	reshape := stepIndex(t, currentRelease, "reshape every job document")
	if at := stepIndex(t, currentRelease, "fold rig slots onto every setup"); at < reshape {
		t.Errorf("the rig fold runs at %d, before the reshape at %d", at, reshape)
	}
}

func TestTheRigFoldsCollectionsAreBackedUp(t *testing.T) {
	t.Parallel()

	copied := releaseTouchedCollections()
	for _, name := range rigSlotCollections {
		if !slices.Contains(copied, name) {
			t.Errorf("%q is folded but never copied, so a revert cannot put it back", name)
		}
	}
}

func TestTheRigFoldCoversGroupTemplates(t *testing.T) {
	t.Parallel()

	if !slices.Contains(rigSlotCollections, eipmongo.CollectionGroupTemplatePayloads) {
		t.Error("group template payloads hold a rigID and are not folded")
	}
}

func TestTheRetiredMarketKeysAreSweptByTheRelease(t *testing.T) {
	t.Parallel()

	stepIndex(t, currentRelease, "drop the market keys this release retires")
}

func TestTheZarzakhSweepRunsAfterTheStepsThatRewriteASetup(t *testing.T) {
	t.Parallel()

	sweep := stepIndex(t, currentRelease, "clear the system left on a setup that moved off The Fulcrum")
	for _, before := range []string{
		"reshape every job document",
		"fold rig slots onto every setup",
	} {
		if at := stepIndex(t, currentRelease, before); at > sweep {
			t.Errorf("%q runs at %d, after the Zarzakh sweep at %d", before, at, sweep)
		}
	}
}
