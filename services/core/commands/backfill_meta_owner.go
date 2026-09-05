package commands

import (
	"context"
	"flag"
	"fmt"
	"time"

	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/stackservices"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

// metaOwnerCollections hold documents whose `_meta` embeds models.MetaData, and
// so carry the account id the owner block is derived from.
//
// Accounts and settings are here alongside the planner-scoped documents: their
// owner is the account itself, which is true, and keeps one `_meta` shape rather
// than one for account-owned documents and another for planner-held ones.
var metaOwnerCollections = []string{
	eipmongo.CollectionAccounts,
	eipmongo.CollectionAccountSettings,
	eipmongo.CollectionJobs,
	eipmongo.CollectionJobDocuments,
	eipmongo.CollectionJobGroups,
	eipmongo.CollectionArchivedJobs,
}

// unstampedMetaOwner selects documents holding a usable account id and no owner
// block, which is what makes the command resumable and safe to repeat.
//
// An empty or non-string account id is excluded rather than stamped: it would
// produce an owner that addresses nothing, and a document that quietly addresses
// nothing is worse than one an operator is told about.
var unstampedMetaOwner = bson.M{
	"_meta.accountID": bson.M{"$type": "string", "$ne": ""},
	"_meta.owner":     bson.M{"$exists": false},
}

// runBackfillMetaOwner stamps `_meta.owner` on documents that carry an account id
// and no owner block.
//
// The owner is derived from the account id in the same document, so the update
// runs as a pipeline server-side: no document travels to this process, and each
// one is written atomically from its own field.
//
// `_meta.accountID` is left in place. Every query filter still reads it, and
// nothing reads the owner block yet, so this writes the new shape ahead of the
// code rather than switching to it.
func runBackfillMetaOwner(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("backfillMetaOwner", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintf(fs.Output(), "Usage: tasks backfillMetaOwner [flags]\n\n")
		fmt.Fprintf(fs.Output(), "Stamps _meta.owner {kind, id} on documents carrying _meta.accountID,\n")
		fmt.Fprintf(fs.Output(), "deriving the owner from the account id already on the document.\n\n")
		fmt.Fprintf(fs.Output(), "_meta.accountID is left in place: query filters still read it.\n")
		fmt.Fprintf(fs.Output(), "Safe to repeat — a document already carrying an owner is skipped.\n\n")
		fmt.Fprintf(fs.Output(), "Collections:\n")
		for _, name := range metaOwnerCollections {
			fmt.Fprintf(fs.Output(), "  %s\n", name)
		}
		fmt.Fprintln(fs.Output())
		fs.PrintDefaults()
	}
	dryRun := fs.Bool("dry-run", false, "report what would change; write nothing")
	if err := fs.Parse(args); err != nil {
		return err
	}

	clients, stopDeps, err := stackservices.Connect(ctx, stackservices.Mongo)
	if err != nil {
		return err
	}
	defer lifecycle.RunCleanups(5*time.Second, stopDeps)

	ctxRun, cancel := context.WithTimeout(ctx, 15*time.Minute)
	defer cancel()

	stamp := mongodriver.Pipeline{{{Key: "$set", Value: bson.M{
		"_meta.owner": bson.M{
			"kind": string(models.OwnerAccount),
			"id":   "$_meta.accountID",
		},
	}}}}

	var total int64
	for _, name := range metaOwnerCollections {
		coll := clients.Mongo.Coll(name)

		eligible, cerr := coll.CountDocuments(ctxRun, unstampedMetaOwner)
		if cerr != nil {
			return fmt.Errorf("count %s: %w", name, cerr)
		}
		unusable, cerr := coll.CountDocuments(ctxRun, bson.M{
			"_meta.owner": bson.M{"$exists": false},
			"$or": []bson.M{
				{"_meta.accountID": bson.M{"$exists": false}},
				{"_meta.accountID": ""},
			},
		})
		if cerr != nil {
			return fmt.Errorf("count unusable in %s: %w", name, cerr)
		}

		if *dryRun {
			fmt.Printf("dry-run: %-24s %d would be stamped", name, eligible)
			if unusable > 0 {
				fmt.Printf(", %d carry no usable account id", unusable)
			}
			fmt.Println()
			continue
		}

		res, uerr := coll.UpdateMany(ctxRun, unstampedMetaOwner, stamp)
		if uerr != nil {
			return fmt.Errorf("stamp %s: %w", name, uerr)
		}
		if res.ModifiedCount != eligible {
			return fmt.Errorf("%s: stamped %d of %d", name, res.ModifiedCount, eligible)
		}
		total += res.ModifiedCount

		fmt.Printf("%-24s %d stamped", name, res.ModifiedCount)
		if unusable > 0 {
			fmt.Printf(", %d left alone with no usable account id", unusable)
		}
		fmt.Println()
	}

	if !*dryRun {
		fmt.Printf("\n_meta.owner stamped on %d document(s)\n", total)
	}
	return nil
}
