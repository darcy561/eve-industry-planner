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
	"eve-industry-planner/shared/stackservices"

	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// releaseStep is one piece of cutover work. Steps report what they did so a
// dry-run and a real run print the same shape, and each is independent of the
// others so a failure names itself rather than stopping the release.
type releaseStep struct {
	name string
	run  func(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error)
}

// release groups the steps one app version owes the database.
//
// Grouping by version rather than keeping one flat list is what lets an operator
// read what a deploy is about to do, and what lets a reader tell which release
// introduced a step long after it became a no-op.
type release struct {
	version string
	steps   []releaseStep
}

// releases is every version's cutover work, oldest first, in the order it has to
// happen.
//
// Add to this rather than adding a sibling command: an operator running a release
// should not have to know which steps their version needs. Every release's steps
// run every time, because a step that has become a no-op reports zero rather than
// being removed — which is what makes running this against an environment that is
// already current safe, and what lets an environment several versions behind
// catch up in one command.
var releases = []release{{
	version: "0.9.0",
	steps: []releaseStep{
		// First: later steps stamp the current schema version onto documents they
		// touch, so anything still owing an earlier upgrade has to run it now or
		// be recorded as current without ever having done so.
		{name: "complete outstanding schema maintenance", run: completeSchemaMaintenance},
		{name: "drop retired statistics fields", run: dropRetiredStatisticsFields},
		{name: "drop retired change stream resume tokens", run: dropRetiredResumeTokens},
		{name: "drop unaddressable rebuild queue entries", run: dropUnaddressableQueueEntries},
		// Before the rebuild: it derives each row's category names from the jobs.
		{name: "stamp extras category labels onto jobs", run: stampExtrasCategoryLabels},
		// After the jobs are stamped and before the rebuild: the rebuild is what
		// writes these collections back, in the owner-keyed shape.
		{name: "copy the statistics documents before the rebuild", run: snapshotDerivedStatistics},
		{name: "queue every account for rebuild", run: queueEveryAccountForRebuild},
	},
}}

// runPrepareRelease brings stored documents to the shape the deployed code
// reads, and queues the work that refills what it changed.
//
// This is the release migration: a deploy runs it once, and it is the only place
// a version's data work is written down.
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

	clients, stopDeps, err := stackservices.Connect(ctx, stackservices.Services{Mongo: true, Redis: true})
	if err != nil {
		return err
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
				continue
			}
			fmt.Printf("%s%s: %s\n", prefix, label, result)
		}
	}

	if len(failures) > 0 {
		// Steps do not depend on each other, so the ones that succeeded stand and
		// the release can be re-run for the rest.
		return fmt.Errorf("prepareRelease: %d/%d step(s) failed", len(failures), total)
	}

	if !*dryRun {
		fmt.Println("run `tasks dispatchStatisticsRebuilds` to rebuild now, or wait for the scheduled pass")
	}
	return nil
}

// retiredStatisticsFields are fields the statistics documents no longer carry.
//
// Removing a field from its struct stops it being written, but the rebuild
// upserts with $set and never replaces, so a document that already holds one
// keeps it. They are listed here to be unset.
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

// dropRetiredResumeTokens removes the stored change stream position of any group
// that is no longer watched.
//
// Tokens are written without an expiry, so a group removed from the registry
// leaves its key behind indefinitely. The registry is the source of truth for
// which groups exist, so anything else under the prefix is retired by definition.
func dropRetiredResumeTokens(ctx context.Context, clients *stackservices.Clients, dryRun bool) (string, error) {
	var stored []string
	var cursor uint64
	for {
		keys, next, err := clients.Redis.Scan(ctx, cursor, primaryhandoff.ResumeTokenKey("*"), 100).Result()
		if err != nil {
			return "", err
		}
		stored = append(stored, keys...)
		if next == 0 {
			break
		}
		cursor = next
	}
	retired := retiredResumeTokenKeys(stored, changestream.CollectionGroups())

	if len(retired) == 0 {
		return "none retired", nil
	}
	if dryRun {
		return fmt.Sprintf("%d retired: %s", len(retired), strings.Join(retired, ", ")), nil
	}

	removed, err := clients.Redis.Del(ctx, retired...).Result()
	if err != nil && err != redis.Nil {
		return "", err
	}
	return fmt.Sprintf("%d removed: %s", removed, strings.Join(retired, ", ")), nil
}

// dropUnaddressableQueueEntries removes queue entries whose id names no owner.
//
// The queue is keyed by owner, and a dispatch skips an id it cannot read back
// rather than failing the whole pass — so an entry left under an older key would
// never be dispatched and never cleared. They are dropped rather than converted
// because the step that follows queues every account anyway.
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
	accounts, err := mongo.ArchivedJobs.DistinctStrings(ctx, "_meta.accountID", bson.M{})
	if err != nil {
		return "", fmt.Errorf("distinct archived job accounts: %w", err)
	}
	if len(accounts) == 0 {
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
		// The queue is idempotent, so re-running picks up what failed without
		// undoing what did not.
		for _, qerr := range queueErrs {
			fmt.Fprintf(os.Stderr, "  %v\n", qerr)
		}
		return "", fmt.Errorf("%d/%d account(s) failed to queue", len(queueErrs), len(accounts))
	}
	return fmt.Sprintf("%d/%d account(s) queued", queued, len(accounts)), nil
}

// retiredResumeTokenKeys picks the stored keys that name no live group.
//
// The registry is the source of truth for which groups exist, so a key under the
// prefix that no group claims belongs to a watcher that no longer runs. Sorted so
// a run reports them in the same order twice.
func retiredResumeTokenKeys(stored []string, groups []changestream.CollectionGroup) []string {
	live := make(map[string]bool, len(groups))
	for _, group := range groups {
		live[primaryhandoff.ResumeTokenKey(group.ID)] = true
	}

	var retired []string
	for _, key := range stored {
		if !live[key] {
			retired = append(retired, key)
		}
	}
	slices.Sort(retired)
	return retired
}
