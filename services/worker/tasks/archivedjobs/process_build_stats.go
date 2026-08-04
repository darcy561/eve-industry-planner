package archivedjobs

import (
	"context"
	"fmt"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/mongo/writers"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"github.com/hibiken/asynq"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const buildStatsBatchSize = 500

// ProcessBuildStats implements the Mongo replacement for Firebase archievedJobs.js.
// The task payload must include account_id; it processes all unprocessed archived jobs for that
// account in batches until none remain.
//
// build_stats aggregates are running totals: `buildStatSnapshotIncUpdate` feeds `$inc` only, so each
// processed job adds to totalJobs, itemBuildCount, buildCostTotal, salesTotal, profitLoss, etc.
// `$set` updates jobType/typeID to this job’s values only (same as legacy Firebase batch—they are not
// sums). Each job’s full per-job breakdown is appended via `$push` to dataSnapshots.
func ProcessBuildStats(ctx context.Context, task *asynq.Task, deps *esitasks.TaskDependencies) error {
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
	}
	if task == nil {
		return fmt.Errorf("task is nil")
	}

	req, err := esitasks.UnmarshalTaskPayload[natscore.ProcessArchivedBuildStatsRequest](task)
	if err != nil {
		return fmt.Errorf("decode task payload: %w", err)
	}
	if req.AccountID == "" {
		return fmt.Errorf("account_id is required")
	}

	mongo := deps.Mongo
	archivedColl := mongo.ArchivedJobs.Collection()

	filter := bson.M{"$and": bson.A{
		eipmongo.ArchivedJobAccountFilter(req.AccountID),
		eipmongo.UnprocessedArchivedJobFilter(),
	}}

	totalProcessed := 0
	totalSkipped := 0
	batchNum := 0

	for {
		if err := ctx.Err(); err != nil {
			return err
		}

		cursor, err := archivedColl.Find(ctx, filter, options.Find().SetLimit(buildStatsBatchSize))
		if err != nil {
			return fmt.Errorf("find unprocessed archived jobs: %w", err)
		}

		var jobs []models.Job
		err = cursor.All(ctx, &jobs)
		_ = cursor.Close(ctx)
		if err != nil {
			return fmt.Errorf("decode archived jobs: %w", err)
		}

		if len(jobs) == 0 {
			break
		}
		batchNum++

		processed := 0
		skipped := 0
		pairs := make([]writers.BuildStatsArchivePair, 0, len(jobs))

		for i := range jobs {
			job := &jobs[i]
			acct := job.MetaData.AccountID
			snap, err := computeBuildStatSnapshot(*job)
			if err != nil {
				logs.WarnCtx(ctx, "archivedjobs build stats: skip job (invalid quantities)",
					"job_id", job.JobID,
					"account_id", acct,
					"error", err,
				)
				skipped++
				continue
			}
			if acct == "" || acct != req.AccountID {
				logs.WarnCtx(ctx, "archivedjobs build stats: skip job (account mismatch)",
					"job_id", job.JobID,
					"expected_account_id", req.AccountID,
					"job_account_id", acct,
				)
				skipped++
				continue
			}

			statsID := eipmongo.BuildStatsDocumentID(acct, job.ItemID)
			pairs = append(pairs, writers.BuildStatsArchivePair{
				StatsFilter: bson.M{"_id": statsID},
				StatsUpdate: bson.M{
					"$inc":  buildStatSnapshotIncUpdate(snap),
					"$set":  bson.M{"jobType": snap.JobType, "typeID": snap.TypeID},
					"$push": bson.M{"dataSnapshots": snap},
				},
				JobFilter: bson.M{"_id": job.JobID},
				JobUpdate: bson.M{"$set": bson.M{"_meta.archiveProcessed": true}},
			})
			processed++
		}

		if err := writers.ApplyBuildStatsArchiveBatch(ctx, mongo,
			fmt.Sprintf("ProcessBuildStats batch %d account=%s", batchNum, req.AccountID), pairs); err != nil {
			return fmt.Errorf("build_stats batch bulk write account=%s batch=%d: %w", req.AccountID, batchNum, err)
		}

		totalProcessed += processed
		totalSkipped += skipped

		logs.InfoCtx(ctx, "archivedjobs build stats: batch done",
			"account_id", req.AccountID,
			"batch", batchNum,
			"candidates", len(jobs),
			"processed", processed,
			"skipped", skipped,
			"bulk_pairs", len(pairs),
		)

		if len(jobs) < buildStatsBatchSize {
			break
		}
	}

	if batchNum == 0 {
		logs.InfoCtx(ctx, "archivedjobs build stats: no unprocessed jobs for account",
			"account_id", req.AccountID,
		)
		return nil
	}

	logs.InfoCtx(ctx, "archivedjobs build stats: account complete",
		"account_id", req.AccountID,
		"batches", batchNum,
		"processed", totalProcessed,
		"skipped", totalSkipped,
	)
	return nil
}
