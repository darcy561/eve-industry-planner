package commands

import (
	"context"
	"flag"
	"fmt"
	"os"
	"time"

	"eve-industry-planner/shared/archivestats"
	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/stackservices"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

// backfillBatchSize bounds one bulk write. Large enough that the whole
// collection is a handful of round trips, small enough not to build a request
// Mongo rejects.
const backfillBatchSize = 500

// runBackfillArchivedAt sets _meta.archivedAt on archived jobs that lack it,
// using the earliest date the job's own records evidence.
//
// The archive write path always stamps archivedAt, so a job without one arrived
// from an import whose source recorded no archive timestamp. Its linked industry
// jobs and its sales still date it, and that date is what the statistics pipeline
// would otherwise re-derive on every rebuild.
//
// Jobs with neither linked jobs nor sales are left alone. Their createdAt records
// when the import ran rather than when the work happened, so writing it would
// date months of history to the week of the migration — precise-looking and
// wrong. Those jobs keep falling back at read time, which is honest about not
// knowing.
func runBackfillArchivedAt(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("backfillArchivedAt", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintf(fs.Output(), "Usage: tasks backfillArchivedAt [flags]\n\n")
		fmt.Fprintf(fs.Output(), "Sets _meta.archivedAt on archived jobs that lack it, from the earliest\n")
		fmt.Fprintf(fs.Output(), "date the job's linked industry jobs or sales evidence.\n\n")
		fmt.Fprintf(fs.Output(), "Jobs with no such evidence are left unset: their createdAt records the\n")
		fmt.Fprintf(fs.Output(), "import, not the work.\n\n")
		fmt.Fprintf(fs.Output(), "Queue a statistics rebuild afterwards so cost months pick up the new dates:\n")
		fmt.Fprintf(fs.Output(), "  tasks queueArchivedJobStatsRebuild -all\n\n")
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

	coll := clients.Mongo.ArchivedJobs.Collection()

	// A missing archivedAt reaches Mongo as the zero time rather than an absent
	// field, because the model writes a time.Time. Both forms are matched so the
	// command works whichever way a document was written.
	missing := bson.M{"$or": []bson.M{
		{"_meta.archivedAt": bson.M{"$exists": false}},
		{"_meta.archivedAt": nil},
		{"_meta.archivedAt": time.Time{}},
	}}

	cursor, err := coll.Find(ctxRun, missing)
	if err != nil {
		return fmt.Errorf("find archived jobs without an archive date: %w", err)
	}
	defer cursor.Close(ctxRun)

	var (
		scanned    int
		evidenced  int
		unevidence int
		written    int64
		writes     []mongodriver.WriteModel
	)

	flush := func() error {
		if len(writes) == 0 {
			return nil
		}
		res, werr := coll.BulkWrite(ctxRun, writes)
		writes = writes[:0]
		if werr != nil {
			return werr
		}
		if res != nil {
			written += res.ModifiedCount
		}
		return nil
	}

	for cursor.Next(ctxRun) {
		var job models.Job
		if err := cursor.Decode(&job); err != nil {
			return fmt.Errorf("decode archived job: %w", err)
		}
		scanned++

		archivedAt, ok := archivestats.EvidencedArchiveDate(job)
		if !ok {
			unevidence++
			continue
		}
		evidenced++

		if *dryRun {
			continue
		}

		writes = append(writes, mongodriver.NewUpdateOneModel().
			SetFilter(bson.M{"_id": job.JobID}).
			SetUpdate(bson.M{"$set": bson.M{"_meta.archivedAt": archivedAt}}))

		if len(writes) >= backfillBatchSize {
			if err := flush(); err != nil {
				return fmt.Errorf("write archive dates: %w", err)
			}
		}
	}
	if err := cursor.Err(); err != nil {
		return fmt.Errorf("scan archived jobs: %w", err)
	}
	if err := flush(); err != nil {
		return fmt.Errorf("write archive dates: %w", err)
	}

	if *dryRun {
		fmt.Printf("dry-run: %d job(s) without an archive date; %d can be dated from their own records, %d cannot\n",
			scanned, evidenced, unevidence)
		return nil
	}

	fmt.Printf("archive dates written: %d/%d (scanned %d, %d have no evidence to date them)\n",
		written, evidenced, scanned, unevidence)
	if unevidence > 0 {
		fmt.Fprintf(os.Stderr,
			"note: %d job(s) carry no linked industry job and no sale, so nothing in the document dates them. "+
				"They keep resolving their month at read time.\n", unevidence)
	}
	fmt.Println("run `tasks queueArchivedJobStatsRebuild -all` so cost months pick up the new dates")
	return nil
}
