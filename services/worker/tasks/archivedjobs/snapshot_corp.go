package archivedjobs

import (
	"context"
	"fmt"

	authzhmac "eve-industry-planner/shared/core/crypto/authzhmac/helper"
	corecrypto "eve-industry-planner/shared/core/crypto/aesgcm"
	mongocore "eve-industry-planner/shared/core/mongo"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	archivedjobshelpers "eve-industry-planner/worker/tasks/archivedjobs/helpers"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"github.com/hibiken/asynq"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// ProcessCorpArchivedJobSnapshots writes corp_archivedJobs → corp_archived_job_stats for one opaque corp ref.
// Corporation-archived jobs are not account-bound: only enqueues dirty corp refs for ProcessDirtyCorpBuildStats
// (not user_build_stats_dirty_accounts / personal aggregates).
func ProcessCorpArchivedJobSnapshots(ctx context.Context, task *asynq.Task, deps *esitasks.TaskDependencies) error {
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
	}
	if task == nil {
		return fmt.Errorf("task is nil")
	}

	req, err := esitasks.UnmarshalTaskPayload[natscore.ProcessCorpArchivedJobSnapshotsRequest](task)
	if err != nil {
		return fmt.Errorf("decode task payload: %w", err)
	}
	if req.CorpRef == "" {
		return fmt.Errorf("corp_ref is required")
	}

	_, keyring, h, err := archivedjobshelpers.LoadPipelineCrypto()
	if err != nil {
		return err
	}

	db := deps.Mongo.Database(mongocore.DatabaseName)
	corpArchived := db.Collection(mongocore.CollectionCorpArchivedJobs)
	snapshotCollCorp := db.Collection(mongocore.CollectionCorpArchivedJobStats)
	snapshotCollUser := db.Collection(mongocore.CollectionUserArchivedJobStats)

	prevCorpRefs, err := CollectCorpRefsFromCorpOwnedSnapshots(ctx, snapshotCollCorp, req.CorpRef, keyring, h)
	if err != nil {
		return fmt.Errorf("collect corp refs before corp_ref=%s: %w", req.CorpRef, err)
	}

	filter := bson.M{"$and": bson.A{
		mongocore.CorpArchivedJobCorpRefFilter(req.CorpRef),
		mongocore.UnprocessedArchivedJobFilter(),
	}}

	retryCfg := mongocore.DefaultRetryConfig()
	totalProcessed := 0
	totalSkipped := 0
	batchNum := 0

	for {
		if err := ctx.Err(); err != nil {
			return err
		}

		cursor, err := corpArchived.Find(ctx, filter, options.Find().SetLimit(buildStatsBatchSize))
		if err != nil {
			return fmt.Errorf("find unprocessed corp archived jobs: %w", err)
		}

		var jobs []models.Job
		err = cursor.All(ctx, &jobs)
		_ = cursor.Close(ctx)
		if err != nil {
			return fmt.Errorf("decode corp archived jobs: %w", err)
		}

		if len(jobs) == 0 {
			break
		}
		batchNum++

		processed := 0
		skipped := 0

		for i := range jobs {
			job := &jobs[i]
			corpRef := job.MetaData.CorpRef
			snap, err := computeBuildStatSnapshot(*job)
			if err != nil {
				logs.WarnCtx(ctx, "corp archivedjobs snapshot: skip job (invalid quantities)",
					"job_id", job.JobID,
					"corp_ref", corpRef,
					"error", err,
				)
				skipped++
				continue
			}
			if corpRef == "" || corpRef != req.CorpRef {
				logs.WarnCtx(ctx, "corp archivedjobs snapshot: skip job (corp ref mismatch)",
					"job_id", job.JobID,
					"expected_corp_ref", req.CorpRef,
					"job_corp_ref", corpRef,
				)
				skipped++
				continue
			}

			snapshotDoc, buildErr := archivedjobshelpers.BuildCorpArchivedJobStatsSnapshot(*job, snap, req.CorpRef)
			if buildErr != nil {
				logs.WarnCtx(ctx, "corp archivedjobs snapshot: snapshot build failed",
					"job_id", job.JobID, "corp_ref", corpRef, "error", buildErr)
				skipped++
				continue
			}
			err = archivedjobshelpers.UpsertArchivedJobStatsSnapshot(ctx, snapshotCollCorp, snapshotCollUser, snapshotDoc, retryCfg)
			if err != nil {
				return fmt.Errorf("corp snapshot upsert job_id=%s: %w", job.JobID, err)
			}

			jobFilter := bson.M{"_id": job.JobID, "_meta.corpRef": req.CorpRef}
			jobUpdate := bson.M{"$set": bson.M{"_meta.archiveProcessed": true}}

			err = mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
				_, e := corpArchived.UpdateOne(ctx, jobFilter, jobUpdate)
				return e
			})
			if err != nil {
				return fmt.Errorf("mark corp archived job processed job_id=%s: %w", job.JobID, err)
			}

			processed++
		}

		totalProcessed += processed
		totalSkipped += skipped

		logs.InfoCtx(ctx, "corp archivedjobs snapshot: batch done",
			"corp_ref", req.CorpRef,
			"batch", batchNum,
			"candidates", len(jobs),
			"processed", processed,
			"skipped", skipped,
		)

		if len(jobs) < buildStatsBatchSize {
			break
		}
	}

	if batchNum == 0 {
		logs.DebugCtx(ctx, "corp archivedjobs snapshotter: no unprocessed jobs for corp ref", "corp_ref", req.CorpRef)
		return nil
	}
	logs.InfoCtx(ctx, "corp archivedjobs snapshotter: corp ref snapshot complete",
		"corp_ref", req.CorpRef,
		"batches", batchNum,
		"processed", totalProcessed,
		"skipped", totalSkipped,
	)

	if totalProcessed > 0 {
		dirtyRefsColl := db.Collection(mongocore.CollectionCorpBuildStatsDirtyRefs)
		if err := markDirtyCorpRefsAfterCorpArchivedPass(ctx, dirtyRefsColl, req.CorpRef, keyring, h, snapshotCollCorp, prevCorpRefs); err != nil {
			return fmt.Errorf("mark dirty corp refs corp_ref=%s: %w", req.CorpRef, err)
		}
	}

	logs.InfoCtx(ctx, "corp archivedjobs snapshot pass complete",
		"corp_ref", req.CorpRef, "snapshot_batches", batchNum, "snapshot_processed", totalProcessed, "snapshot_skipped", totalSkipped)
	return nil
}

// CollectCorpRefsFromCorpOwnedSnapshots returns distinct corp refs implied by corp_archived_job_stats rows
// owned by one opaque corp ref (document.corpRef matches).
func CollectCorpRefsFromCorpOwnedSnapshots(ctx context.Context, snapshotColl *mongo.Collection, corpRef string, keyring *corecrypto.Keyring, h *authzhmac.Helper) ([]string, error) {
	cur, err := snapshotColl.Find(ctx, bson.M{
		"corpRef": corpRef,
		"revoked": bson.M{"$ne": true},
	})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var docs []models.ArchivedJobStats
	if err := cur.All(ctx, &docs); err != nil {
		return nil, err
	}
	return archivedjobshelpers.CorpRefsFromArchivedJobStatsDocs(docs, keyring, h), nil
}

func markDirtyCorpRefsAfterCorpArchivedPass(
	ctx context.Context,
	dirtyRefsColl *mongo.Collection,
	corpRef string,
	keyring *corecrypto.Keyring,
	h *authzhmac.Helper,
	snapshotCollCorp *mongo.Collection,
	prevCorpRefs []string,
) error {
	currentRefs, err := CollectCorpRefsFromCorpOwnedSnapshots(ctx, snapshotCollCorp, corpRef, keyring, h)
	if err != nil {
		return err
	}
	return archivedjobshelpers.MarkDirtyCorpRefs(ctx, dirtyRefsColl, archivedjobshelpers.UnionSortedNonEmpty(prevCorpRefs, currentRefs))
}
