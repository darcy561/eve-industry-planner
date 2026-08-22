package commands

import (
	"context"
	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/stackservices"
	"flag"
	"fmt"
	"os"
	"regexp"
	"strings"
	"time"

	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
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
// so the Firestore archive import will pick them up again. _meta.archivedAt, _meta.archivedBy,
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

	clients, stopDeps, err := stackservices.Connect(ctx, stackservices.Mongo)
	if err != nil {
		return err
	}
	defer lifecycle.RunCleanups(5*time.Second, stopDeps)

	filter := bson.M{}
	scopeDesc := "all accounts"
	if accountTrim != "" {
		filter["_meta.accountID"] = accountTrim
		scopeDesc = fmt.Sprintf("_meta.accountID=%s", accountTrim)
	}

	mongo := clients.Mongo
	coll := mongo.ArchivedJobs.Collection()

	ctxCount, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	n, err := coll.CountDocuments(ctxCount, filter)
	if err != nil {
		return fmt.Errorf("count archivedJobs: %w", err)
	}

	if *dryRun {
		fmt.Printf("dry-run [%s]: %d document(s) would be marked unprocessed (archive flags only)\n", scopeDesc, n)
		if n == 0 {
			fmt.Fprint(os.Stderr, archivedJobsEmptyHint(scopeDesc))
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
		fmt.Fprint(os.Stderr, archivedJobsEmptyHint(scopeDesc))
	}
	return nil
}

func archivedJobsEmptyHint(scopeDesc string) string {
	return fmt.Sprintf(
		"note: no documents matched in %s.%s (scope: %s). "+
			"If you expected rows here, confirm MONGO_URL points at the right cluster and that archived jobs "+
			"have been imported into Mongo (they are not read from Firestore by this command).\n",
		eipmongo.DatabaseName, eipmongo.CollectionAccountArchivedJobs, scopeDesc,
	)
}

