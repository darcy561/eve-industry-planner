package archivedjobs

import (
	"context"
	"fmt"

	"eve-industry-planner/shared/core/authzhmac"
	corecrypto "eve-industry-planner/shared/core/crypto"
	mongocore "eve-industry-planner/shared/core/mongo"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared/models"
	archivedjobshelpers "eve-industry-planner/worker/tasks/archivedjobs/helpers"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"github.com/hibiken/asynq"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// ProcessArchivedJobSnapshots writes one snapshot per processed job into corp_archived_job_stats (corp-linked) or user_archived_job_stats (personal-only).
// Account aggregates (user_build_stats) run in ProcessDirtyAccountBuildStats; corp aggregates in ProcessDirtyCorpBuildStats.
// Payload must include account_id; processes unprocessed archived jobs in batches until none remain.
func ProcessArchivedJobSnapshots(ctx context.Context, task *asynq.Task, deps *esitasks.TaskDependencies) error {
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
	}
	if task == nil {
		return fmt.Errorf("task is nil")
	}

	req, err := esitasks.UnmarshalTaskPayload[natscore.ProcessArchivedJobSnapshotsRequest](task)
	if err != nil {
		return fmt.Errorf("decode task payload: %w", err)
	}
	if req.AccountID == "" {
		return fmt.Errorf("account_id is required")
	}

	_, keyring, h, err := archivedjobshelpers.LoadPipelineCrypto()
	if err != nil {
		return err
	}

	db := deps.Mongo.Database(mongocore.DatabaseName)
	archived := db.Collection(mongocore.CollectionArchivedJobs)
	snapshotCollCorp := db.Collection(mongocore.CollectionCorpArchivedJobStats)
	snapshotCollUser := db.Collection(mongocore.CollectionUserArchivedJobStats)

	prevCorpRefs, err := CollectCorpRefsFromAccountSnapshots(ctx, snapshotCollCorp, req.AccountID, keyring, h)
	if err != nil {
		return fmt.Errorf("collect corp refs before processing account_id=%s: %w", req.AccountID, err)
	}

	filter := bson.M{"$and": bson.A{
		mongocore.ArchivedJobAccountFilter(req.AccountID),
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

		cursor, err := archived.Find(ctx, filter, options.Find().SetLimit(buildStatsBatchSize))
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

			snapshotDoc, buildErr := archivedjobshelpers.BuildArchivedJobStatsSnapshot(*job, snap)
			if buildErr != nil {
				logs.WarnCtx(ctx, "archivedjobs build stats: snapshot marshal/build failed",
					"job_id", job.JobID, "account_id", acct, "error", buildErr)
				skipped++
				continue
			}
			targetColl := snapshotCollUser
			if archivedjobshelpers.ArchivedJobStatsContributesToCorpBuildStats(snapshotDoc, keyring, h) {
				targetColl = snapshotCollCorp
			}
			mirrorColl := snapshotCollCorp
			if targetColl == snapshotCollCorp {
				mirrorColl = snapshotCollUser
			}
			err = archivedjobshelpers.UpsertArchivedJobStatsSnapshot(ctx, targetColl, mirrorColl, snapshotDoc, retryCfg)
			if err != nil {
				return fmt.Errorf("snapshot upsert job_id=%s: %w", job.JobID, err)
			}

			jobFilter := bson.M{"_id": job.JobID}
			jobUpdate := bson.M{"$set": bson.M{"_meta.archiveProcessed": true}}

			err = mongocore.RetryMongoOperation(ctx, retryCfg, func() error {
				_, e := archived.UpdateOne(ctx, jobFilter, jobUpdate)
				return e
			})
			if err != nil {
				return fmt.Errorf("mark archived job processed job_id=%s: %w", job.JobID, err)
			}

			processed++
		}

		totalProcessed += processed
		totalSkipped += skipped

		logs.InfoCtx(ctx, "archivedjobs build stats: batch done",
			"account_id", req.AccountID,
			"batch", batchNum,
			"candidates", len(jobs),
			"processed", processed,
			"skipped", skipped,
		)

		// Queue aggregate rebuild as soon as a batch commits snapshots so a crash before the final pass
		// cannot leave per-job rows without a dirty-account row.
		if processed > 0 {
			dirtyAccountsColl := db.Collection(mongocore.CollectionUserBuildStatsDirtyAccounts)
			if err := archivedjobshelpers.MarkDirtyAccountForRebuild(ctx, dirtyAccountsColl, req.AccountID); err != nil {
				return fmt.Errorf("mark dirty account for rebuild account_id=%s: %w", req.AccountID, err)
			}
		}

		if len(jobs) < buildStatsBatchSize {
			break
		}
	}

	if batchNum == 0 {
		logs.DebugCtx(ctx, "archivedjobs snapshotter: no unprocessed jobs for account",
			"account_id", req.AccountID)
		return nil
	}
	logs.InfoCtx(ctx, "archivedjobs snapshotter: account snapshot complete",
		"account_id", req.AccountID,
		"batches", batchNum,
		"processed", totalProcessed,
		"skipped", totalSkipped,
	)

	if totalProcessed > 0 {
		dirtyRefsColl := db.Collection(mongocore.CollectionCorpBuildStatsDirtyRefs)
		if err := markDirtyCorpRefsAfterAccountPass(ctx, dirtyRefsColl, req.AccountID, keyring, h, snapshotCollCorp, prevCorpRefs); err != nil {
			return fmt.Errorf("mark dirty corp refs account_id=%s: %w", req.AccountID, err)
		}
	}

	logs.InfoCtx(ctx, "archivedjobs snapshot pass complete",
		"account_id", req.AccountID, "snapshot_batches", batchNum, "snapshot_processed", totalProcessed, "snapshot_skipped", totalSkipped)
	return nil
}

// CollectCorpRefsFromAccountSnapshots returns distinct corp refs implied by corp_archived_job_stats rows
// for one account (same derivation as corp_build_stats aggregation).
func CollectCorpRefsFromAccountSnapshots(ctx context.Context, snapshotColl *mongo.Collection, accountID string, keyring *corecrypto.Keyring, h *authzhmac.Helper) ([]string, error) {
	cur, err := snapshotColl.Find(ctx, bson.M{
		"accountID": accountID,
		"revoked":   bson.M{"$ne": true},
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

// markDirtyCorpRefsAfterAccountPass queues corp aggregate rebuilds by corp ref only.
// prevCorpRefs is the snapshot-derived set before processing; current state is read after snapshots rebuild.
// Union covers corps no longer referenced by this account (character left corp) without storing account→corp links.
func markDirtyCorpRefsAfterAccountPass(
	ctx context.Context,
	dirtyRefsColl *mongo.Collection,
	accountID string,
	keyring *corecrypto.Keyring,
	h *authzhmac.Helper,
	snapshotCollCorp *mongo.Collection,
	prevCorpRefs []string,
) error {
	currentRefs, err := CollectCorpRefsFromAccountSnapshots(ctx, snapshotCollCorp, accountID, keyring, h)
	if err != nil {
		return err
	}
	return archivedjobshelpers.MarkDirtyCorpRefs(ctx, dirtyRefsColl, archivedjobshelpers.UnionSortedNonEmpty(prevCorpRefs, currentRefs))
}
