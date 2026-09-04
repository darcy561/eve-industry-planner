package commands

import (
	"context"
	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/stackservices"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// runQueueArchivedJobStatsRebuild queues accounts for a statistics rebuild.
//
// Rebuilds are wholesale and read archived jobs directly, so an account is the
// only unit that matters: whichever of its jobs changed, the recomputation is
// the same. Nothing is written to the job documents, so there is no per-job
// state for an operator to reset.
func runQueueArchivedJobStatsRebuild(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("queueArchivedJobStatsRebuild", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintf(fs.Output(), "Usage: tasks queueArchivedJobStatsRebuild [flags]\n\n")
		fmt.Fprintf(fs.Output(), "Queues accounts holding archived jobs for a statistics rebuild.\n")
		fmt.Fprintf(fs.Output(), "Reads archived jobs; writes only the rebuild queue.\n\n")
		fmt.Fprintf(fs.Output(), "The rebuild runs when the drain next fires; trigger it now with\n")
		fmt.Fprintf(fs.Output(), "  tasks drainAccountStatsRebuildQueue\n\n")
		fmt.Fprintf(fs.Output(), "Scope: use -account to limit to one account, or omit -account / pass -all for every account.\n\n")
		fs.PrintDefaults()
	}
	account := fs.String("account", "", "only the account with this _meta.accountID (omit or use -all for every account)")
	markAll := fs.Bool("all", false, "explicitly queue every account (same as omitting -account); cannot combine with -account")
	dryRun := fs.Bool("dry-run", false, "print the accounts that would be queued; do not queue them")
	if err := fs.Parse(args); err != nil {
		return err
	}

	accountTrim := strings.TrimSpace(*account)
	if *markAll && accountTrim != "" {
		return fmt.Errorf("queueArchivedJobStatsRebuild: use either -all or -account, not both")
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

	ctxRun, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	accounts, err := mongo.ArchivedJobs.DistinctStrings(ctxRun, "_meta.accountID", filter)
	if err != nil {
		return fmt.Errorf("distinct archived job accounts: %w", err)
	}

	if len(accounts) == 0 {
		fmt.Printf("no accounts hold archived jobs [%s]\n", scopeDesc)
		fmt.Fprint(os.Stderr, archivedJobsEmptyHint(scopeDesc))
		return nil
	}

	if *dryRun {
		fmt.Printf("dry-run [%s]: %d account(s) would be queued for a statistics rebuild\n", scopeDesc, len(accounts))
		return nil
	}

	now := time.Now().UTC()
	queued := 0
	var queueErrs []error
	for _, accountID := range accounts {
		if err := mongo.QueueOwnerWork(ctxRun, models.AccountStatsOwner(accountID), eipmongo.StatsWorkRebuild, now); err != nil {
			queueErrs = append(queueErrs, fmt.Errorf("queue %s: %w", accountID, err))
			continue
		}
		queued++
	}

	fmt.Printf("queued for statistics rebuild [%s]: %d/%d account(s)\n", scopeDesc, queued, len(accounts))
	if len(queueErrs) > 0 {
		// Named on stderr rather than summarised: the queue is idempotent, so an
		// operator can re-run for the accounts that failed without undoing the
		// ones that succeeded.
		fmt.Fprintf(os.Stderr, "warning: %d account(s) could not be queued:\n", len(queueErrs))
		for _, qerr := range queueErrs {
			fmt.Fprintf(os.Stderr, "  %v\n", qerr)
		}
		return fmt.Errorf("queueArchivedJobStatsRebuild: %d/%d accounts failed to queue", len(queueErrs), len(accounts))
	}

	fmt.Println("run `tasks drainAccountStatsRebuildQueue` to rebuild now, or wait for the hourly drain")
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
