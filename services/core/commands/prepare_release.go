package commands

import (
	"context"
	"flag"
	"fmt"
	"os"
	"slices"
	"strings"
	"time"

	"eve-industry-planner/core/changestream"
	"eve-industry-planner/core/primaryhandoff"
	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/plannersession"
	"eve-industry-planner/shared/stackservices"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// releaseStep is one piece of cutover work, reporting what it did; a required step stops the release
// when it fails, because the steps after it read its output.
type releaseStep struct {
	name     string
	required bool
	run      func(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error)
}

// release groups the steps one app version owes the database.
type release struct {
	version string
	steps   []releaseStep
}

// releases is every version's cutover work in the order it runs; every step runs every time and
// reports zero once it has nothing to do.
var releases = []release{{
	version: currentRelease,
	steps: []releaseStep{
		{name: "check the owner-scoped id rewrite has finished", run: warnOwnerScopedIDsOutstanding},
		{name: "copy every collection this release writes to", required: true, run: backupReleaseCollections},
		{name: "complete outstanding schema maintenance", required: true, run: completeSchemaMaintenance},
		{name: "stamp the owner onto every scoped document", required: true, run: stampMetaOwner},
		{name: "drop retired change stream resume tokens", run: dropRetiredResumeTokens},
		{name: "drop unaddressable rebuild queue entries", run: dropUnaddressableQueueEntries},
		{name: "stamp extras category labels onto jobs", run: stampExtrasCategoryLabels},
		{name: "reshape every job document", required: true, run: reshapeJobDocumentsStep},
		{name: "store every extras and invention row in the shape its model writes", run: normaliseExtrasAndInventionRows},
		{name: "drop retired statistics fields", run: dropRetiredStatisticsFields},
		{name: "queue every account for rebuild", run: queueEveryAccountForRebuild},
		{name: "rebuild the current SDE version", run: rebuildCurrentSDEVersion},
		{name: "give every account its planner", run: backfillAccountPlanners},
		{name: "move each account's planner settings onto its planner", run: backfillPlannerSettings},
		{name: "give every document a write counter at _meta.revision", run: ensureMetaRevision},
		{name: "rewrite session grants as owner keys", run: repairSessionGrants},
		{name: "seed each account's buying and selling pricing defaults", run: seedPricingDefaults},
		{name: "fold custom structures into one array", run: foldCustomStructures},
		{name: "give every settings document an empty market lane", run: seedMarketLocationLane},
		{name: "fold rig slots onto every saved structure", run: foldStructureRigSlots},
		{name: "move every saved market onto its own lane", run: moveMarketsToTheirOwnLane},
		{name: "fold rig slots onto every setup", run: foldRigSlots},
		{name: "clear the system left on a setup that moved off The Fulcrum", run: clearZarzakhLeftovers},
		{name: "drop the market keys this release retires", run: dropRetiredMarketKeys},
		{name: "verify every document carries an owner", run: verifyMetaOwner},
		{name: "verify every owner-scoped id carries its owner", run: verifyOwnerScopedIDs},
	},
}}

// runPrepareRelease brings stored documents to the shape the deployed code reads, and queues the work
// that refills what it changed.
func runPrepareRelease(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("prepareRelease", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintf(fs.Output(), "Usage: tasks prepareRelease [flags]\n\n")
		fmt.Fprintf(fs.Output(), "Runs every release's cutover steps, oldest first:\n")
		for _, rel := range releases {
			fmt.Fprintf(fs.Output(), "  %s\n", rel.version)
			for _, step := range rel.steps {
				fmt.Fprintf(fs.Output(), "    - %s\n", step.name)
			}
		}
		fmt.Fprintf(fs.Output(), "\nSafe to re-run: a step that has nothing to do reports zero.\n")
		fmt.Fprintf(fs.Output(), "The rebuild runs when the drain next fires; trigger it now with\n")
		fmt.Fprintf(fs.Output(), "  tasks dispatchStatisticsRebuilds\n\n")
		fs.PrintDefaults()
	}
	dryRun := fs.Bool("dry-run", false, "report what each step would change; write nothing")
	if err := fs.Parse(args); err != nil {
		return err
	}

	clients, stopDeps, err := stackservices.Connect(ctx, stackservices.Services{Mongo: true, Redis: true, NATS: true})
	if err != nil {
		clients, stopDeps, err = stackservices.Connect(ctx, stackservices.Services{Mongo: true, Redis: true})
		if err != nil {
			return err
		}
	}
	defer lifecycle.RunCleanups(5*time.Second, stopDeps)

	ctxRun, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()

	prefix := ""
	if *dryRun {
		prefix = "dry-run: "
	}

	var failures []error
	total := 0
	for _, rel := range releases {
		for _, step := range rel.steps {
			total++
			label := rel.version + " " + step.name
			result, err := step.run(ctxRun, clients, *dryRun)
			if err != nil {
				failures = append(failures, fmt.Errorf("%s: %w", label, err))
				fmt.Fprintf(os.Stderr, "  %s: failed: %v\n", label, err)
				if step.required {
					fmt.Fprintf(os.Stderr, "  stopping: the steps after this one read what it writes\n")
					return fmt.Errorf("prepareRelease: %w", failures[len(failures)-1])
				}
				continue
			}
			fmt.Printf("%s%s: %s\n", prefix, label, result)
		}
	}

	if len(failures) > 0 {
		return fmt.Errorf("prepareRelease: %d/%d step(s) failed", len(failures), total)
	}

	if !*dryRun {
		fmt.Println("run `tasks dispatchStatisticsRebuilds` to rebuild now, or wait for the scheduled pass")
	}
	return nil
}

func repairSessionGrants(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	report, err := plannersession.NewStore(clients.Redis).RepairGrants(ctx, dryRun)
	if err != nil {
		return "", err
	}
	verb := "rewritten"
	if dryRun {
		verb = "would be rewritten"
	}
	out := fmt.Sprintf("%d scanned, %d %s", report.Scanned, report.Repaired, verb)
	if report.Failed > 0 {
		out += fmt.Sprintf(", %d failed", report.Failed)
	}
	return out, nil
}

// retiredStatisticsFields are fields the statistics documents no longer carry, unset because the
// rebuild's $set never removes one.
var retiredStatisticsFields = []string{"dataSnapshots", "buildRows"}

func dropRetiredStatisticsFields(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	coll := clients.Mongo.StatisticsTotals.Collection()

	unset := bson.M{}
	or := make([]bson.M, 0, len(retiredStatisticsFields))
	for _, field := range retiredStatisticsFields {
		unset[field] = ""
		or = append(or, bson.M{field: bson.M{"$exists": true}})
	}
	if len(or) == 0 {
		return "no retired fields", nil
	}
	filter := bson.M{"$or": or}

	if dryRun {
		count, err := coll.CountDocuments(ctx, filter)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%d document(s) carry %s", count, strings.Join(retiredStatisticsFields, ", ")), nil
	}

	res, err := coll.UpdateMany(ctx, filter, bson.M{"$unset": unset})
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%d document(s) cleared of %s", res.ModifiedCount, strings.Join(retiredStatisticsFields, ", ")), nil
}

// dropRetiredResumeTokens removes the stored change stream position of any group that is no longer
// watched.
func dropRetiredResumeTokens(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	tokens := primaryhandoff.NewResumeTokens(clients.Redis)
	stored, err := tokens.Stored(ctx)
	if err != nil {
		return "", err
	}
	retired := retiredResumeTokenGroups(stored, changestream.CollectionGroups())

	if len(retired) == 0 {
		return "none retired", nil
	}
	if dryRun {
		return fmt.Sprintf("%d retired: %s", len(retired), strings.Join(retired, ", ")), nil
	}

	if err := tokens.Drop(ctx, retired...); err != nil {
		return "", err
	}
	return fmt.Sprintf("%d removed: %s", len(retired), strings.Join(retired, ", ")), nil
}

// dropUnaddressableQueueEntries removes queue entries whose id names no owner.
func dropUnaddressableQueueEntries(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	coll := clients.Mongo.StatisticsRebuildQueue.Collection()

	var stored []string
	if err := coll.Distinct(ctx, "_id", bson.M{}).Decode(&stored); err != nil {
		return "", err
	}

	var unaddressable []string
	for _, id := range stored {
		if _, perr := models.ParseOwnerKey(id); perr != nil {
			unaddressable = append(unaddressable, id)
		}
	}
	if len(unaddressable) == 0 {
		return "none", nil
	}
	if dryRun {
		return fmt.Sprintf("%d entry(s) name no owner", len(unaddressable)), nil
	}

	res, err := coll.DeleteMany(ctx, bson.M{"_id": bson.M{"$in": unaddressable}})
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%d entry(s) removed", res.DeletedCount), nil
}

func queueEveryAccountForRebuild(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	mongo := clients.Mongo
	accounts, err := mongo.ArchivedJobs.DistinctStrings(ctx, eipmongo.FieldMetaOwnerID, bson.M{})
	if err != nil {
		return "", fmt.Errorf("distinct archived job accounts: %w", err)
	}
	if len(accounts) == 0 {
		held, countErr := mongo.ArchivedJobs.Collection().CountDocuments(ctx, bson.M{})
		if countErr != nil {
			return "", fmt.Errorf("count archived jobs: %w", countErr)
		}
		if held > 0 {
			return "", fmt.Errorf("%d archived job(s) name no owner: the owner stamp has not run", held)
		}
		return "no accounts hold archived jobs", nil
	}
	if dryRun {
		return fmt.Sprintf("%d account(s) would be queued", len(accounts)), nil
	}

	now := time.Now().UTC()
	queued := 0
	var queueErrs []error
	for _, accountID := range accounts {
		if err := mongo.QueueOwnerWork(ctx, models.AccountOwner(accountID), eipmongo.StatsWorkRebuild, now); err != nil {
			queueErrs = append(queueErrs, fmt.Errorf("queue %s: %w", accountID, err))
			continue
		}
		queued++
	}
	if len(queueErrs) > 0 {
		for _, qerr := range queueErrs {
			fmt.Fprintf(os.Stderr, "  %v\n", qerr)
		}
		return "", fmt.Errorf("%d/%d account(s) failed to queue", len(queueErrs), len(accounts))
	}
	return fmt.Sprintf("%d/%d account(s) queued", queued, len(accounts)), nil
}

// retiredResumeTokenGroups picks the stored groups the registry no longer lists, sorted so a run
// reports them in the same order twice.
func retiredResumeTokenGroups(stored []string, groups []changestream.CollectionGroup) []string {
	live := make(map[string]bool, len(groups))
	for _, group := range groups {
		live[group.ID] = true
	}

	var retired []string
	for _, groupID := range stored {
		if !live[groupID] {
			retired = append(retired, groupID)
		}
	}
	slices.Sort(retired)
	return retired
}
