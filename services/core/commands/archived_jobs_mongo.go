package commands

import (
	"context"
	"flag"
	"fmt"
	"os"
	"regexp"
	"strings"
	"time"

	authzhmac "eve-industry-planner/shared/core/crypto/authzhmac/helper"
	"eve-industry-planner/shared/core/config"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared"
	"eve-industry-planner/shared/models"
	archivedjobtasks "eve-industry-planner/worker/tasks/archivedjobs"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func buildStatsIDPrefixFilter(accountID string) bson.M {
	if strings.TrimSpace(accountID) == "" {
		return bson.M{}
	}
	// _id is "accountID|typeID" (see worker archivedjobs.buildStatsDocumentID).
	pattern := "^" + regexp.QuoteMeta(strings.TrimSpace(accountID)) + `\|`
	return bson.M{"_id": bson.M{"$regex": pattern}}
}

func archivedJobStatsAccountFilter(accountID string) bson.M {
	filter := bson.M{}
	if strings.TrimSpace(accountID) != "" {
		filter["accountID"] = strings.TrimSpace(accountID)
	}
	return filter
}

func corpRefPrefixFilter(corpRef string) bson.M {
	pattern := "^" + regexp.QuoteMeta(strings.TrimSpace(corpRef)) + `\|`
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
		mongocore.DatabaseName, mongocore.CollectionArchivedJobs, scopeDesc,
	)
}

// runResetBuildStats deletes build/account/corp stats documents for a clean reprocess.
// With -account, only rows for that account are removed.
func runResetBuildStats(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("resetBuildStats", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintf(fs.Output(), "Usage: tasks resetBuildStats [flags]\n\n")
		fmt.Fprintf(fs.Output(), "Deletes build_stats, user_build_stats, user_build_stats_buckets, corp_archived_job_stats, user_archived_job_stats,\n")
		fmt.Fprintf(fs.Output(), "corp_rollup_buckets, corp_build_stats, corp_build_stats_buckets, corp_build_stats_dirty_refs,\n")
		fmt.Fprintf(fs.Output(), "user_build_stats_dirty_accounts, and corp stats tracking/aggregate documents.\n")
		fmt.Fprintf(fs.Output(), "Use after markArchivedJobsUnprocessed\n")
		fmt.Fprintf(fs.Output(), "for a full snapshot+aggregate rebuild. Does not modify archivedJobs source data.\n\n")
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

	filterStats := buildStatsIDPrefixFilter(*account)
	filterSnapshots := archivedJobStatsAccountFilter(*account)
	db := clients.Mongo.Database(mongocore.DatabaseName)
	buildStatsColl := db.Collection(mongocore.CollectionBuildStats)
	userBuildStatsColl := db.Collection(mongocore.CollectionUserBuildStats)
	userRollupBucketsColl := db.Collection(mongocore.CollectionUserBuildStatsBuckets)
	snapshotColl := db.Collection(mongocore.CollectionCorpArchivedJobStats)
	userSnapshotColl := db.Collection(mongocore.CollectionUserArchivedJobStats)
	corpRollupBucketsColl := db.Collection(mongocore.CollectionCorpRollupBuckets)
	corpStatsColl := db.Collection(mongocore.CollectionCorpBuildStats)
	corpBucketColl := db.Collection(mongocore.CollectionCorpBuildStatsBuckets)
	corpDirtyColl := db.Collection(mongocore.CollectionCorpBuildStatsDirtyRefs)
	dirtyAccountsColl := db.Collection(mongocore.CollectionUserBuildStatsDirtyAccounts)
	corpAccountRefsColl := db.Collection(mongocore.CollectionCorpBuildStatsAccountRefs)

	ctxOp, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	accountTrim := strings.TrimSpace(*account)
	var accountCorpRefs []string
	if accountTrim != "" {
		cfg, err := config.LoadConfig()
		if err != nil {
			return err
		}
		if cfg.RefreshTokenKeyring == nil {
			return fmt.Errorf("resetBuildStats -account requires refresh token keyring (derive corp refs from corp_archived_job_stats)")
		}
		h, err := authzhmac.NewFromEnv()
		if err != nil {
			return err
		}
		var errRefs error
		accountCorpRefs, errRefs = archivedjobtasks.CollectCorpRefsFromAccountSnapshots(ctxOp, snapshotColl, accountTrim, cfg.RefreshTokenKeyring, h)
		if errRefs != nil {
			return fmt.Errorf("derive corp refs for account: %w", errRefs)
		}
	}

	nBuildStats, err := buildStatsColl.CountDocuments(ctxOp, filterStats)
	if err != nil {
		return fmt.Errorf("count build_stats: %w", err)
	}
	nSnapshots, err := snapshotColl.CountDocuments(ctxOp, filterSnapshots)
	if err != nil {
		return fmt.Errorf("count corp_archived_job_stats: %w", err)
	}
	nUserSnapshots, err := userSnapshotColl.CountDocuments(ctxOp, filterSnapshots)
	if err != nil {
		return fmt.Errorf("count user_archived_job_stats: %w", err)
	}
	nUserBuildStats, err := userBuildStatsColl.CountDocuments(ctxOp, filterStats)
	if err != nil {
		return fmt.Errorf("count user_build_stats: %w", err)
	}
	nUserRollupBuckets, err := userRollupBucketsColl.CountDocuments(ctxOp, filterStats)
	if err != nil {
		return fmt.Errorf("count user_build_stats_buckets: %w", err)
	}
	var nCorpStats, nCorpBuckets, nCorpDirty, nCorpAccountRefs, nDirtyAccounts, nCorpRollupBuckets int64
	if accountTrim == "" {
		nCorpStats, err = corpStatsColl.CountDocuments(ctxOp, bson.M{})
		if err != nil {
			return fmt.Errorf("count corp_build_stats: %w", err)
		}
		nCorpBuckets, err = corpBucketColl.CountDocuments(ctxOp, bson.M{})
		if err != nil {
			return fmt.Errorf("count corp_build_stats_buckets: %w", err)
		}
		nCorpDirty, err = corpDirtyColl.CountDocuments(ctxOp, bson.M{})
		if err != nil {
			return fmt.Errorf("count corp_build_stats_dirty_refs: %w", err)
		}
		nCorpAccountRefs, err = corpAccountRefsColl.CountDocuments(ctxOp, bson.M{})
		if err != nil {
			return fmt.Errorf("count corp_build_stats_account_refs: %w", err)
		}
		nDirtyAccounts, err = dirtyAccountsColl.CountDocuments(ctxOp, bson.M{})
		if err != nil {
			return fmt.Errorf("count user_build_stats_dirty_accounts: %w", err)
		}
		nCorpRollupBuckets, err = corpRollupBucketsColl.CountDocuments(ctxOp, bson.M{})
		if err != nil {
			return fmt.Errorf("count corp_rollup_buckets: %w", err)
		}
	} else {
		if len(accountCorpRefs) > 0 {
			orFilters := make([]bson.M, 0, len(accountCorpRefs))
			dirtyIDs := make([]string, 0, len(accountCorpRefs))
			for _, ref := range accountCorpRefs {
				if strings.TrimSpace(ref) == "" {
					continue
				}
				orFilters = append(orFilters, corpRefPrefixFilter(ref))
				dirtyIDs = append(dirtyIDs, ref)
			}
			if len(orFilters) > 0 {
				nCorpStats, err = corpStatsColl.CountDocuments(ctxOp, bson.M{"$or": orFilters})
				if err != nil {
					return fmt.Errorf("count corp_build_stats(account): %w", err)
				}
				nCorpBuckets, err = corpBucketColl.CountDocuments(ctxOp, bson.M{"$or": orFilters})
				if err != nil {
					return fmt.Errorf("count corp_build_stats_buckets(account): %w", err)
				}
				nCorpDirty, err = corpDirtyColl.CountDocuments(ctxOp, bson.M{"_id": bson.M{"$in": dirtyIDs}})
				if err != nil {
					return fmt.Errorf("count corp_build_stats_dirty_refs(account): %w", err)
				}
			}
		}
		nCorpAccountRefs, err = corpAccountRefsColl.CountDocuments(ctxOp, bson.M{"_id": accountTrim})
		if err != nil {
			return fmt.Errorf("count corp_build_stats_account_refs(account): %w", err)
		}
		nDirtyAccounts, err = dirtyAccountsColl.CountDocuments(ctxOp, bson.M{"_id": accountTrim})
		if err != nil {
			return fmt.Errorf("count user_build_stats_dirty_accounts(account): %w", err)
		}
		nCorpRollupBuckets, err = corpRollupBucketsColl.CountDocuments(ctxOp, bson.M{"lane": accountTrim})
		if err != nil {
			return fmt.Errorf("count corp_rollup_buckets(account lane): %w", err)
		}
	}

	if *dryRun {
		fmt.Printf("dry-run: would delete build_stats=%d user_build_stats=%d user_build_stats_buckets=%d corp_archived_job_stats=%d user_archived_job_stats=%d corp_rollup_buckets=%d corp_build_stats=%d corp_build_stats_buckets=%d corp_build_stats_dirty_refs=%d corp_build_stats_account_refs=%d user_build_stats_dirty_accounts=%d\n",
			nBuildStats, nUserBuildStats, nUserRollupBuckets, nSnapshots, nUserSnapshots, nCorpRollupBuckets, nCorpStats, nCorpBuckets, nCorpDirty, nCorpAccountRefs, nDirtyAccounts)
		return nil
	}

	resBuildStats, err := buildStatsColl.DeleteMany(ctxOp, filterStats)
	if err != nil {
		return fmt.Errorf("delete build_stats: %w", err)
	}
	resUserBuildStats, err := userBuildStatsColl.DeleteMany(ctxOp, filterStats)
	if err != nil {
		return fmt.Errorf("delete user_build_stats: %w", err)
	}
	resUserRollupBuckets, err := userRollupBucketsColl.DeleteMany(ctxOp, filterStats)
	if err != nil {
		return fmt.Errorf("delete user_build_stats_buckets: %w", err)
	}

	var resSnapshots, resUserSnapshots *mongo.DeleteResult
	var deletedCorpStats, deletedCorpBuckets, deletedCorpDirty, deletedCorpAccountRefs, deletedDirtyAccounts int64
	var deletedCorpRollupBuckets int64

	if accountTrim == "" {
		resSnapshots, err = snapshotColl.DeleteMany(ctxOp, filterSnapshots)
		if err != nil {
			return fmt.Errorf("delete corp_archived_job_stats: %w", err)
		}
		resUserSnapshots, err = userSnapshotColl.DeleteMany(ctxOp, filterSnapshots)
		if err != nil {
			return fmt.Errorf("delete user_archived_job_stats: %w", err)
		}
		if res, err := corpStatsColl.DeleteMany(ctxOp, bson.M{}); err != nil {
			return fmt.Errorf("delete corp_build_stats: %w", err)
		} else {
			deletedCorpStats = res.DeletedCount
		}
		if res, err := corpBucketColl.DeleteMany(ctxOp, bson.M{}); err != nil {
			return fmt.Errorf("delete corp_build_stats_buckets: %w", err)
		} else {
			deletedCorpBuckets = res.DeletedCount
		}
		if res, err := corpDirtyColl.DeleteMany(ctxOp, bson.M{}); err != nil {
			return fmt.Errorf("delete corp_build_stats_dirty_refs: %w", err)
		} else {
			deletedCorpDirty = res.DeletedCount
		}
		if res, err := corpAccountRefsColl.DeleteMany(ctxOp, bson.M{}); err != nil {
			return fmt.Errorf("delete corp_build_stats_account_refs: %w", err)
		} else {
			deletedCorpAccountRefs = res.DeletedCount
		}
		if res, err := dirtyAccountsColl.DeleteMany(ctxOp, bson.M{}); err != nil {
			return fmt.Errorf("delete user_build_stats_dirty_accounts: %w", err)
		} else {
			deletedDirtyAccounts = res.DeletedCount
		}
		if res, err := corpRollupBucketsColl.DeleteMany(ctxOp, bson.M{}); err != nil {
			return fmt.Errorf("delete corp_rollup_buckets: %w", err)
		} else {
			deletedCorpRollupBuckets = res.DeletedCount
		}
	} else {
		orFilters := make([]bson.M, 0, len(accountCorpRefs))
		dirtyIDs := make([]string, 0, len(accountCorpRefs))
		for _, ref := range accountCorpRefs {
			if strings.TrimSpace(ref) == "" {
				continue
			}
			orFilters = append(orFilters, corpRefPrefixFilter(ref))
			dirtyIDs = append(dirtyIDs, ref)
		}
		if len(orFilters) > 0 {
			if res, err := corpStatsColl.DeleteMany(ctxOp, bson.M{"$or": orFilters}); err != nil {
				return fmt.Errorf("delete corp_build_stats(account): %w", err)
			} else {
				deletedCorpStats = res.DeletedCount
			}
			if res, err := corpBucketColl.DeleteMany(ctxOp, bson.M{"$or": orFilters}); err != nil {
				return fmt.Errorf("delete corp_build_stats_buckets(account): %w", err)
			} else {
				deletedCorpBuckets = res.DeletedCount
			}
			if res, err := corpDirtyColl.DeleteMany(ctxOp, bson.M{"_id": bson.M{"$in": dirtyIDs}}); err != nil {
				return fmt.Errorf("delete corp_build_stats_dirty_refs(account): %w", err)
			} else {
				deletedCorpDirty = res.DeletedCount
			}
		}
		resSnapshots, err = snapshotColl.DeleteMany(ctxOp, filterSnapshots)
		if err != nil {
			return fmt.Errorf("delete corp_archived_job_stats: %w", err)
		}
		resUserSnapshots, err = userSnapshotColl.DeleteMany(ctxOp, filterSnapshots)
		if err != nil {
			return fmt.Errorf("delete user_archived_job_stats: %w", err)
		}
		if res, err := corpAccountRefsColl.DeleteMany(ctxOp, bson.M{"_id": accountTrim}); err != nil {
			return fmt.Errorf("delete corp_build_stats_account_refs(account): %w", err)
		} else {
			deletedCorpAccountRefs = res.DeletedCount
		}
		if res, err := dirtyAccountsColl.DeleteMany(ctxOp, bson.M{"_id": accountTrim}); err != nil {
			return fmt.Errorf("delete user_build_stats_dirty_accounts(account): %w", err)
		} else {
			deletedDirtyAccounts = res.DeletedCount
		}
		if res, err := corpRollupBucketsColl.DeleteMany(ctxOp, bson.M{"lane": accountTrim}); err != nil {
			return fmt.Errorf("delete corp_rollup_buckets(account): %w", err)
		} else {
			deletedCorpRollupBuckets = res.DeletedCount
		}
	}

	fmt.Printf("reset build stats: build_stats deleted=%d, user_build_stats deleted=%d, user_build_stats_buckets deleted=%d, corp_archived_job_stats deleted=%d, user_archived_job_stats deleted=%d, corp_rollup_buckets deleted=%d, corp_build_stats deleted=%d, corp_build_stats_buckets deleted=%d, corp_build_stats_dirty_refs deleted=%d, corp_build_stats_account_refs deleted=%d, user_build_stats_dirty_accounts deleted=%d\n",
		resBuildStats.DeletedCount, resUserBuildStats.DeletedCount, resUserRollupBuckets.DeletedCount, resSnapshots.DeletedCount, resUserSnapshots.DeletedCount, deletedCorpRollupBuckets, deletedCorpStats, deletedCorpBuckets, deletedCorpDirty, deletedCorpAccountRefs, deletedDirtyAccounts)
	return nil
}

// runRebuildArchivedJobStats is a convenience command that combines:
//  1) markArchivedJobsUnprocessed
//  2) resetBuildStats
// so operators can kick off a full rebuild workflow with one CLI action.
func runRebuildArchivedJobStats(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("rebuildArchivedJobStats", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintf(fs.Output(), "Usage: tasks rebuildArchivedJobStats [flags]\n\n")
		fmt.Fprintf(fs.Output(), "Runs markArchivedJobsUnprocessed + resetBuildStats in one command.\n")
		fmt.Fprintf(fs.Output(), "Use -account for one account, or omit -account / pass -all for every account.\n\n")
		fs.PrintDefaults()
	}
	account := fs.String("account", "", "only this accountID (omit or use -all for all accounts)")
	markAll := fs.Bool("all", false, "explicitly target all accounts (same as omitting -account); cannot combine with -account")
	dryRun := fs.Bool("dry-run", false, "show counts only; do not update/delete")
	if err := fs.Parse(args); err != nil {
		return err
	}

	accountTrim := strings.TrimSpace(*account)
	if *markAll && accountTrim != "" {
		return fmt.Errorf("rebuildArchivedJobStats: use either -all or -account, not both")
	}

	markArgs := []string{}
	if *dryRun {
		markArgs = append(markArgs, "-dry-run")
	}
	if accountTrim != "" {
		markArgs = append(markArgs, "-account", accountTrim)
	} else if *markAll {
		markArgs = append(markArgs, "-all")
	}
	if err := runMarkArchivedJobsUnprocessed(ctx, markArgs); err != nil {
		return err
	}

	resetArgs := []string{}
	if *dryRun {
		resetArgs = append(resetArgs, "-dry-run")
	}
	if accountTrim != "" {
		resetArgs = append(resetArgs, "-account", accountTrim)
	}
	if err := runResetBuildStats(ctx, resetArgs); err != nil {
		return err
	}
	return nil
}

func runRestoreArchivedJob(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("restoreArchivedJob", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintf(fs.Output(), "Usage: tasks restoreArchivedJob -account <id> -job <jobID> [-dry-run]\n\n")
		fmt.Fprintf(fs.Output(), "Restores one archived job back to user_job_documents, revokes snapshot rows,\n")
		fmt.Fprintf(fs.Output(), "and removes the row from archivedJobs.\n\n")
		fs.PrintDefaults()
	}
	accountID := fs.String("account", "", "required _meta.accountID owner")
	jobID := fs.String("job", "", "required job ID")
	dryRun := fs.Bool("dry-run", false, "show what would happen without modifying Mongo")
	if err := fs.Parse(args); err != nil {
		return err
	}
	account := strings.TrimSpace(*accountID)
	job := strings.TrimSpace(*jobID)
	if account == "" || job == "" {
		return fmt.Errorf("restoreArchivedJob: both -account and -job are required")
	}

	clients, err := shared.ConnectServices(ctx, shared.ServiceMongo)
	if err != nil {
		return err
	}
	defer runImmediateCleanups(clients.CleanupFns...)
	db := clients.Mongo.Database(mongocore.DatabaseName)
	archivedColl := db.Collection(mongocore.CollectionArchivedJobs)
	liveColl := db.Collection(mongocore.CollectionUserJobDocuments)
	snapshotColl := db.Collection(mongocore.CollectionCorpArchivedJobStats)
	userSnapshotColl := db.Collection(mongocore.CollectionUserArchivedJobStats)

	ctxOp, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()

	var doc models.Job
	if err := archivedColl.FindOne(ctxOp, bson.M{"_id": job, "_meta.accountID": account}).Decode(&doc); err != nil {
		return fmt.Errorf("restoreArchivedJob: archived doc not found: %w", err)
	}
	if *dryRun {
		fmt.Printf("dry-run: would restore job %s for account %s, revoke snapshot %s, and delete archived row\n",
			job, account, mongocore.ArchivedJobStatsDocumentID(account, job))
		return nil
	}

	now := time.Now().UTC()
	if _, err := liveColl.UpdateOne(
		ctxOp,
		bson.M{"_id": job, "_meta.accountID": account},
		bson.M{"$set": doc, "$unset": mongocore.UserJobDocumentsUpsertUnset},
		options.Update().SetUpsert(true),
	); err != nil {
		return fmt.Errorf("restoreArchivedJob: upsert live doc: %w", err)
	}
	snapID := mongocore.ArchivedJobStatsDocumentID(account, job)
	if _, err := snapshotColl.UpdateOne(
		ctxOp,
		bson.M{"_id": snapID},
		bson.M{"$set": bson.M{"revoked": true, "revokedAt": now}},
		options.Update().SetUpsert(false),
	); err != nil {
		return fmt.Errorf("restoreArchivedJob: revoke corp_archived_job_stats snapshot: %w", err)
	}
	if _, err := userSnapshotColl.UpdateOne(
		ctxOp,
		bson.M{"_id": snapID},
		bson.M{"$set": bson.M{"revoked": true, "revokedAt": now}},
		options.Update().SetUpsert(false),
	); err != nil {
		return fmt.Errorf("restoreArchivedJob: revoke user_archived_job_stats snapshot: %w", err)
	}
	if _, err := archivedColl.DeleteOne(ctxOp, bson.M{"_id": job, "_meta.accountID": account}); err != nil {
		return fmt.Errorf("restoreArchivedJob: delete archived doc: %w", err)
	}
	fmt.Printf("restored archived job: account=%s job=%s\n", account, job)
	return nil
}
