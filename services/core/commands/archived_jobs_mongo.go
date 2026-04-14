package commands

import (
	"context"
	"flag"
	"fmt"
	"os"
	"regexp"
	"strings"
	"time"

	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/shared"

	"go.mongodb.org/mongo-driver/bson"
)

func buildStatsIDPrefixFilter(accountID string) bson.M {
	if strings.TrimSpace(accountID) == "" {
		return bson.M{}
	}
	// _id is "accountID|typeID" (see worker archivedjobs.buildStatsDocumentID).
	pattern := "^" + regexp.QuoteMeta(strings.TrimSpace(accountID)) + `\|`
	return bson.M{"_id": bson.M{"$regex": pattern}}
}

// runMarkArchivedJobsUnprocessed sets archiveProcessed to false on Mongo archivedJobs documents
// so the build_stats pipeline will pick them up again. _meta.archivedAt, _meta.archivedBy,
// archiveTimeStamp, and other fields are not modified.
func runMarkArchivedJobsUnprocessed(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("markArchivedJobsUnprocessed", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintf(fs.Output(), "Usage: tasks markArchivedJobsUnprocessed [flags]\n\n")
		fmt.Fprintf(fs.Output(), "Clears build-stats processing flags only (archiveProcessed / _meta.archiveProcessed).\n")
		fmt.Fprintf(fs.Output(), "Does not change archived-at timestamps or other metadata.\n\n")
		fmt.Fprintf(fs.Output(), "Scope: use -account to limit to one account, or omit -account / pass -all for every account.\n\n")
		fs.PrintDefaults()
	}
	account := fs.String("account", "", "only documents with this _meta.accountID (omit or use -all for all accounts)")
	markAll := fs.Bool("all", false, "explicitly mark every account (same as omitting -account); cannot combine with -account")
	dryRun := fs.Bool("dry-run", false, "print matched count only; do not update")
	if err := fs.Parse(args); err != nil {
		return err
	}

	accountTrim := strings.TrimSpace(*account)
	if *markAll && accountTrim != "" {
		return fmt.Errorf("markArchivedJobsUnprocessed: use either -all or -account, not both")
	}

	clients, err := shared.ConnectServices(ctx, shared.ServiceMongo)
	if err != nil {
		return err
	}
	defer runImmediateCleanups(clients.CleanupFns...)

	filter := bson.M{}
	scopeDesc := "all accounts"
	if accountTrim != "" {
		filter["_meta.accountID"] = accountTrim
		scopeDesc = fmt.Sprintf("_meta.accountID=%s", accountTrim)
	}

	coll := clients.Mongo.Database(mongocore.DatabaseName).Collection(mongocore.CollectionArchivedJobs)

	ctxCount, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	n, err := coll.CountDocuments(ctxCount, filter)
	if err != nil {
		return fmt.Errorf("count archivedJobs: %w", err)
	}

	if *dryRun {
		fmt.Printf("dry-run [%s]: %d document(s) would be marked unprocessed (archive flags only)\n", scopeDesc, n)
		if n == 0 {
			fmt.Fprintf(os.Stderr, archivedJobsEmptyHint(scopeDesc))
		}
		return nil
	}

	// Only flip processing flags; do not touch _meta.archivedAt, archiveTimeStamp, etc.
	update := bson.M{
		"$set": bson.M{
			"_meta.archiveProcessed": false,
			"archiveProcessed":       false,
		},
	}

	res, err := coll.UpdateMany(ctxCount, filter, update)
	if err != nil {
		return fmt.Errorf("update archivedJobs: %w", err)
	}

	fmt.Printf("marked unprocessed (build-stats) [%s]: matched=%d modified=%d\n", scopeDesc, res.MatchedCount, res.ModifiedCount)
	if res.MatchedCount == 0 {
		fmt.Fprintf(os.Stderr, archivedJobsEmptyHint(scopeDesc))
	}
	return nil
}

func archivedJobsEmptyHint(scopeDesc string) string {
	return fmt.Sprintf(
		"note: no documents matched in %s.%s (scope: %s). "+
			"If you expected rows here, confirm MONGO_URL points at the right cluster and that archived jobs "+
			"have been imported into Mongo (they are not read from Firestore by this command).\n",
		mongocore.DatabaseName, mongocore.CollectionArchivedJobs, scopeDesc,
	)
}

// runResetBuildStats deletes documents from Mongo build_stats (aggregate counters + dataSnapshots).
// With -account, only rows whose _id starts with "accountID|" are removed.
func runResetBuildStats(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("resetBuildStats", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintf(fs.Output(), "Usage: tasks resetBuildStats [flags]\n\n")
		fmt.Fprintf(fs.Output(), "Deletes build_stats documents. Use after markArchivedJobsUnprocessed if you need to re-run\n")
		fmt.Fprintf(fs.Output(), "aggregation without double-counting. Does not modify archivedJobs.\n\n")
		fs.PrintDefaults()
	}
	account := fs.String("account", "", "if set, only delete stats whose _id matches this account (prefix before '|')")
	dryRun := fs.Bool("dry-run", false, "print matched count only; do not delete")
	if err := fs.Parse(args); err != nil {
		return err
	}

	clients, err := shared.ConnectServices(ctx, shared.ServiceMongo)
	if err != nil {
		return err
	}
	defer runImmediateCleanups(clients.CleanupFns...)

	filter := buildStatsIDPrefixFilter(*account)
	coll := clients.Mongo.Database(mongocore.DatabaseName).Collection(mongocore.CollectionBuildStats)

	ctxOp, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	n, err := coll.CountDocuments(ctxOp, filter)
	if err != nil {
		return fmt.Errorf("count build_stats: %w", err)
	}

	if *dryRun {
		fmt.Printf("dry-run: would delete %d build_stats document(s)\n", n)
		return nil
	}

	res, err := coll.DeleteMany(ctxOp, filter)
	if err != nil {
		return fmt.Errorf("delete build_stats: %w", err)
	}

	fmt.Printf("reset build_stats: deleted=%d (matched request)\n", res.DeletedCount)
	return nil
}
