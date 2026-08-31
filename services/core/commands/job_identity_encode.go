package commands

import (
	"context"
	"flag"
	"fmt"
	"strings"
	"time"

	"eve-industry-planner/shared/jobidentity"
	"eve-industry-planner/shared/lifecycle"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/shared/stackservices"
	taskscore "eve-industry-planner/shared/tasks"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type encodeJobIdentityOptions struct {
	collections []string
	limit       int
	dryRun      bool
}

// runEncodeJobIdentity fans out one conversion task per account holding documents
// that still carry raw entity ids, or that were written under an older field set.
//
// The command only enumerates; workers do the writing. Re-running is safe and is
// how progress is measured: with --dry-run the queued count is the work remaining.
func runEncodeJobIdentity(ctx context.Context, args []string) error {
	opts, err := parseEncodeJobIdentityOptions(args)
	if err != nil {
		return err
	}

	clients, stopDeps, err := stackservices.Connect(ctx, stackservices.Services{Mongo: true, NATS: true})
	if err != nil {
		return err
	}
	defer lifecycle.RunCleanups(5*time.Second, stopDeps)

	if err := eipnats.EnsureWorkerTaskStream(clients.NATS.JS()); err != nil {
		return fmt.Errorf("failed to ensure worker task stream: %w", err)
	}

	queued := 0
	for _, collection := range opts.collections {
		docs := clients.Mongo.Docs(collection)
		filter := bson.M{
			"$or": []any{
				jobidentity.RawIDFilter(),
				jobidentity.StaleSpecFilter(),
			},
		}
		accounts, err := docs.DistinctStrings(ctx, "_meta.accountID", filter)
		if err != nil {
			return fmt.Errorf("enumerate accounts needing encoding in %s: %w", collection, err)
		}
		if opts.limit > 0 && len(accounts) > opts.limit {
			accounts = accounts[:opts.limit]
		}

		for _, accountID := range accounts {
			payload := eipnats.EncodeJobIdentityRequest{
				AccountID:  accountID,
				Collection: collection,
				DryRun:     opts.dryRun,
			}
			if err := eipnats.PublishTask(
				ctx,
				clients.NATS,
				taskscore.EncodeJobIdentity.Subject,
				taskscore.EncodeJobIdentity.Name,
				payload,
				taskscore.EncodeJobIdentity.DefaultPriority,
			); err != nil {
				return fmt.Errorf("publish encodeJobIdentity for %s/%s: %w", collection, accountID, err)
			}
			queued++
		}
		fmt.Printf("%s: %d accounts need conversion\n", collection, len(accounts))
	}

	fmt.Printf("Queued %d encodeJobIdentity tasks on subject %q (dry_run=%t)\n",
		queued, taskscore.EncodeJobIdentity.Subject, opts.dryRun)
	return nil
}

func parseEncodeJobIdentityOptions(args []string) (encodeJobIdentityOptions, error) {
	opts := encodeJobIdentityOptions{}
	var collection string

	fs := flag.NewFlagSet("encodeJobIdentity", flag.ContinueOnError)
	fs.StringVar(&collection, "collection", "", "limit to one collection (default: all job collections)")
	fs.IntVar(&opts.limit, "limit", 0, "queue at most this many accounts per collection")
	fs.BoolVar(&opts.dryRun, "dry-run", false, "report what would be encoded without writing")
	if err := fs.Parse(args); err != nil {
		return opts, err
	}

	collection = strings.TrimSpace(collection)
	if collection == "" {
		opts.collections = jobidentity.Collections()
		return opts, nil
	}
	if !jobidentity.SupportedCollection(collection) {
		return opts, fmt.Errorf("--collection=%s is not a job collection %v", collection, jobidentity.Collections())
	}
	opts.collections = []string{collection}
	return opts, nil
}
