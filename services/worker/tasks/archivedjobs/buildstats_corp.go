package archivedjobs

import (
	"context"
	"fmt"
	"strings"

	"eve-industry-planner/shared/core/authzhmac"
	corecrypto "eve-industry-planner/shared/core/crypto"
	mongocore "eve-industry-planner/shared/core/mongo"
	natscore "eve-industry-planner/shared/core/nats"
	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared/models"
	archivedjobshelpers "eve-industry-planner/worker/tasks/archivedjobs/helpers"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"github.com/hibiken/asynq"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// ProcessDirtyCorpBuildStats rebuilds corp_build_stats for dirty corp refs.
// Payload corp_ref processes exactly one ref (cron fan-out; no global Redis lock). Empty corp_ref drains up to max_refs with the global lock (legacy batch).
func ProcessDirtyCorpBuildStats(ctx context.Context, task *asynq.Task, deps *esitasks.TaskDependencies) error {
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
	}
	if task == nil {
		return fmt.Errorf("task is nil")
	}
	req, err := esitasks.UnmarshalTaskPayload[natscore.ProcessDirtyCorpBuildStatsRequest](task)
	if err != nil {
		return fmt.Errorf("decode task payload: %w", err)
	}

	_, keyring, h, err := archivedjobshelpers.LoadPipelineCrypto()
	if err != nil {
		return err
	}

	db := deps.Mongo.Database(mongocore.DatabaseName)
	dirtyRefsColl := db.Collection(mongocore.CollectionCorpBuildStatsDirtyRefs)

	singleRef := strings.TrimSpace(req.CorpRef)
	var refs []string
	if singleRef != "" {
		refs = []string{singleRef}
	} else {
		runRebuild := true
		unlock := func() {}
		if deps.Redis != nil {
			locked, cleanup, lockErr := rediscore.AcquireRefreshLock(ctx, deps.Redis, corpBuildStatsRebuildLockKey)
			if lockErr != nil {
				logs.WarnCtx(ctx, "dirty corp rebuild lock: acquire failed; skipping this run", "error", lockErr)
				runRebuild = false
			} else if !locked {
				logs.DebugCtx(ctx, "dirty corp rebuild lock: not acquired; another worker is rebuilding")
				runRebuild = false
			} else if cleanup != nil {
				unlock = cleanup
			}
		}
		if !runRebuild {
			return nil
		}
		defer unlock()

		maxRefs := req.MaxRefs
		if maxRefs <= 0 {
			maxRefs = defaultDirtyCorpRefBatchSize
		}
		refs, err = archivedjobshelpers.FetchDirtyCorpRefs(ctx, dirtyRefsColl, maxRefs)
		if err != nil {
			return fmt.Errorf("fetch dirty corp refs: %w", err)
		}
		if len(refs) == 0 {
			logs.DebugCtx(ctx, "dirty corp rebuild: no dirty corp refs")
			return nil
		}
	}

	snapshotColl := db.Collection(mongocore.CollectionCorpArchivedJobStats)
	corpStatsColl := db.Collection(mongocore.CollectionCorpBuildStats)
	corpBucketColl := db.Collection(mongocore.CollectionCorpBuildStatsBuckets)
	corpRollupColl := db.Collection(mongocore.CollectionCorpRollupBuckets)

	agg, err := accumulateDirtyCorpStats(ctx, snapshotColl, refs, keyring, h)
	if err != nil {
		return fmt.Errorf("accumulate corp snapshots: %w", err)
	}
	if err := rebuildCorpBuildStatsFromAccumulated(ctx, agg, corpStatsColl, corpBucketColl, refs); err != nil {
		return err
	}
	if err := RebuildCorpRollupMonthlyBucketsFromAccumulated(ctx, corpRollupColl, agg.Rollups, refs); err != nil {
		return fmt.Errorf("rebuild corp rollup buckets: %w", err)
	}
	if _, err := dirtyRefsColl.DeleteMany(ctx, bson.M{"_id": bson.M{"$in": refs}}); err != nil {
		return fmt.Errorf("clear dirty corp refs: %w", err)
	}
	logs.InfoCtx(ctx, "dirty corp rebuild complete", "rebuilt_refs", len(refs), "scoped_corp_ref", singleRef != "")
	return nil
}

type accumulatedDirtyCorpStats struct {
	Lifetimes map[archivedjobshelpers.CorpLifetimeKey]*models.CorpBuildStatsRow
	Buckets   map[archivedjobshelpers.CorpBucketKey]*models.CorpBuildStatsTimelineBucket
	Rollups   map[archivedjobshelpers.CorpRollupBucketKey]*archivedjobshelpers.RollupMonthlyLineAccumulator
}

func accumulateDirtyCorpStats(
	ctx context.Context,
	snapshotColl *mongo.Collection,
	targetCorpRefs []string,
	keyring *corecrypto.Keyring,
	hmacHelper *authzhmac.Helper,
) (*accumulatedDirtyCorpStats, error) {
	if len(targetCorpRefs) == 0 {
		return &accumulatedDirtyCorpStats{
			Lifetimes: map[archivedjobshelpers.CorpLifetimeKey]*models.CorpBuildStatsRow{},
			Buckets:   map[archivedjobshelpers.CorpBucketKey]*models.CorpBuildStatsTimelineBucket{},
			Rollups:   map[archivedjobshelpers.CorpRollupBucketKey]*archivedjobshelpers.RollupMonthlyLineAccumulator{},
		}, nil
	}
	targetSet := map[string]struct{}{}
	for _, ref := range targetCorpRefs {
		if ref != "" {
			targetSet[ref] = struct{}{}
		}
	}
	if len(targetSet) == 0 {
		return &accumulatedDirtyCorpStats{
			Lifetimes: map[archivedjobshelpers.CorpLifetimeKey]*models.CorpBuildStatsRow{},
			Buckets:   map[archivedjobshelpers.CorpBucketKey]*models.CorpBuildStatsTimelineBucket{},
			Rollups:   map[archivedjobshelpers.CorpRollupBucketKey]*archivedjobshelpers.RollupMonthlyLineAccumulator{},
		}, nil
	}

	cur, err := snapshotColl.Find(ctx, bson.M{"revoked": bson.M{"$ne": true}})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	const chunkSize = 512
	chunk := make([]models.ArchivedJobStats, 0, chunkSize)
	out := &accumulatedDirtyCorpStats{
		Lifetimes: map[archivedjobshelpers.CorpLifetimeKey]*models.CorpBuildStatsRow{},
		Buckets:   map[archivedjobshelpers.CorpBucketKey]*models.CorpBuildStatsTimelineBucket{},
		Rollups:   map[archivedjobshelpers.CorpRollupBucketKey]*archivedjobshelpers.RollupMonthlyLineAccumulator{},
	}
	flushChunk := func() {
		if len(chunk) == 0 {
			return
		}
		chunkLifetimes, chunkBuckets := archivedjobshelpers.AccumulateCorpBuildStats(chunk, keyring, hmacHelper)
		mergeCorpLifetimes(out.Lifetimes, chunkLifetimes)
		mergeCorpTimelineBuckets(out.Buckets, chunkBuckets)
		chunkRollups := archivedjobshelpers.AccumulateCorpRollupMonthly(chunk, targetSet, hmacHelper)
		mergeCorpRollupBuckets(out.Rollups, chunkRollups)
		chunk = chunk[:0]
	}
	for cur.Next(ctx) {
		var doc models.ArchivedJobStats
		if err := cur.Decode(&doc); err != nil {
			return nil, err
		}
		chunk = append(chunk, doc)
		if len(chunk) >= chunkSize {
			flushChunk()
		}
	}
	if err := cur.Err(); err != nil {
		return nil, err
	}
	flushChunk()
	return out, nil
}

func rebuildCorpBuildStatsFromAccumulated(
	ctx context.Context,
	agg *accumulatedDirtyCorpStats,
	corpStatsColl *mongo.Collection,
	corpBucketColl *mongo.Collection,
	targetCorpRefs []string,
) error {
	if agg == nil {
		return nil
	}
	targetSet := map[string]struct{}{}
	for _, ref := range targetCorpRefs {
		if r := strings.TrimSpace(ref); r != "" {
			targetSet[r] = struct{}{}
		}
	}
	if len(targetSet) == 0 {
		return nil
	}
	lifetimes := agg.Lifetimes
	buckets := agg.Buckets

	lifetimeWrites := make([]mongo.WriteModel, 0, len(lifetimes))
	lifetimeKeepIDs := make([]string, 0, len(lifetimes))
	for k, v := range lifetimes {
		if _, ok := targetSet[k.CorpRef]; !ok {
			continue
		}
		docID := mongocore.CorpBuildStatsDocumentID(k.CorpRef, k.TypeID)
		lifetimeKeepIDs = append(lifetimeKeepIDs, docID)
		v.ID = docID
		lifetimeWrites = append(lifetimeWrites, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": docID}).
			SetUpdate(bson.M{"$set": v}).
			SetUpsert(true))
	}
	if len(lifetimeWrites) > 0 {
		if _, err := corpStatsColl.BulkWrite(ctx, lifetimeWrites, options.BulkWrite().SetOrdered(false)); err != nil {
			return err
		}
	}
	if err := pruneCorpRowsForRefs(ctx, corpStatsColl, targetCorpRefs, lifetimeKeepIDs); err != nil {
		return err
	}

	bucketWrites := make([]mongo.WriteModel, 0, len(buckets))
	bucketKeepIDs := make([]string, 0, len(buckets))
	for k, v := range buckets {
		if _, ok := targetSet[k.CorpRef]; !ok {
			continue
		}
		docID := mongocore.CorpBuildStatsBucketDocumentID(k.CorpRef, k.TypeID, k.Year, k.Month)
		bucketKeepIDs = append(bucketKeepIDs, docID)
		v.ID = docID
		bucketWrites = append(bucketWrites, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": docID}).
			SetUpdate(bson.M{"$set": v}).
			SetUpsert(true))
	}
	if len(bucketWrites) > 0 {
		if _, err := corpBucketColl.BulkWrite(ctx, bucketWrites, options.BulkWrite().SetOrdered(false)); err != nil {
			return err
		}
	}
	if err := pruneCorpRowsForRefs(ctx, corpBucketColl, targetCorpRefs, bucketKeepIDs); err != nil {
		return err
	}
	return nil
}

func RebuildCorpRollupMonthlyBucketsFromAccumulated(
	ctx context.Context,
	corpRollColl *mongo.Collection,
	built map[archivedjobshelpers.CorpRollupBucketKey]*archivedjobshelpers.RollupMonthlyLineAccumulator,
	dirtyCorpRefs []string,
) error {
	targetSet := make(map[string]struct{}, len(dirtyCorpRefs))
	for _, ref := range dirtyCorpRefs {
		if r := strings.TrimSpace(ref); r != "" {
			targetSet[r] = struct{}{}
		}
	}
	if len(targetSet) == 0 {
		return nil
	}
	if built == nil {
		built = map[archivedjobshelpers.CorpRollupBucketKey]*archivedjobshelpers.RollupMonthlyLineAccumulator{}
	}

	writeModels := make([]mongo.WriteModel, 0, len(built))
	keepByRef := make(map[string][]string)
	for key, acc := range built {
		docID := mongocore.CorpRollupMonthlyDocumentID(key.CorpRef, key.Lane, key.TypeID, key.Year, key.Month)
		writeModels = append(writeModels, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": docID}).
			SetUpdate(bson.M{"$set": models.CorpRollupMonthlyBucket{
				ID:                  docID,
				CorpRef:             key.CorpRef,
				Lane:                key.Lane,
				TypeID:              key.TypeID,
				Year:                key.Year,
				Month:               key.Month,
				TransactionCount:    acc.TransactionCount,
				QuantitySold:        acc.QuantitySold,
				SalesTotal:          acc.SalesTotal,
				JobCostTotal:        acc.JobCostTotal,
				ExtraCategoryTotals: acc.ExtraCategoryTotals,
				TransactionFeeTotal: acc.TransactionFeeTotal,
				BrokersFeeTotal:     acc.BrokersFeeTotal,
				ProfitLoss:          acc.ProfitLoss,
			}}).
			SetUpsert(true))
		keepByRef[key.CorpRef] = append(keepByRef[key.CorpRef], docID)
	}

	if len(writeModels) > 0 {
		if _, err := corpRollColl.BulkWrite(ctx, writeModels, options.BulkWrite().SetOrdered(false)); err != nil {
			return fmt.Errorf("corp rollup buckets bulk write: %w", err)
		}
	}
	for ref := range targetSet {
		keepIDs := keepByRef[ref]
		if _, err := corpRollColl.DeleteMany(ctx, archivedjobshelpers.CorpBuildStatsPruneFilter(ref, keepIDs)); err != nil {
			return fmt.Errorf("prune corp rollup buckets corp_ref=%s: %w", ref, err)
		}
	}
	return nil
}

func pruneCorpRowsForRefs(ctx context.Context, coll *mongo.Collection, refs []string, keepIDs []string) error {
	for _, ref := range refs {
		if ref == "" {
			continue
		}
		filter := archivedjobshelpers.CorpBuildStatsPruneFilter(ref, keepIDs)
		if _, err := coll.DeleteMany(ctx, filter); err != nil {
			return err
		}
	}
	return nil
}

func mergeCorpLifetimes(
	dst map[archivedjobshelpers.CorpLifetimeKey]*models.CorpBuildStatsRow,
	src map[archivedjobshelpers.CorpLifetimeKey]*models.CorpBuildStatsRow,
) {
	for key, row := range src {
		cur := dst[key]
		if cur == nil {
			cloned := *row
			dst[key] = &cloned
			continue
		}
		cur.TotalJobs += row.TotalJobs
		cur.ItemBuildCount += row.ItemBuildCount
		cur.BuildCostTotal += row.BuildCostTotal
		cur.BrokersFeeTotal += row.BrokersFeeTotal
		cur.TransactionFeeTotal += row.TransactionFeeTotal
		cur.JobCostTotal += row.JobCostTotal
		cur.SalesTotal += row.SalesTotal
		cur.ProfitLoss += row.ProfitLoss
		cur.Breakdown.ProductionChain.TotalJobs += row.Breakdown.ProductionChain.TotalJobs
		cur.Breakdown.ProductionChain.ItemBuildCount += row.Breakdown.ProductionChain.ItemBuildCount
		cur.Breakdown.ProductionChain.BuildCostTotal += row.Breakdown.ProductionChain.BuildCostTotal
		cur.Breakdown.ProductionChain.BrokersFeeTotal += row.Breakdown.ProductionChain.BrokersFeeTotal
		cur.Breakdown.ProductionChain.TransactionFeeTotal += row.Breakdown.ProductionChain.TransactionFeeTotal
		cur.Breakdown.ProductionChain.JobCostTotal += row.Breakdown.ProductionChain.JobCostTotal
		cur.Breakdown.ProductionChain.SalesTotal += row.Breakdown.ProductionChain.SalesTotal
		cur.Breakdown.ProductionChain.ProfitLoss += row.Breakdown.ProductionChain.ProfitLoss
		cur.Breakdown.RetainedStock.TotalJobs += row.Breakdown.RetainedStock.TotalJobs
		cur.Breakdown.RetainedStock.ItemBuildCount += row.Breakdown.RetainedStock.ItemBuildCount
		cur.Breakdown.RetainedStock.BuildCostTotal += row.Breakdown.RetainedStock.BuildCostTotal
		cur.Breakdown.RetainedStock.BrokersFeeTotal += row.Breakdown.RetainedStock.BrokersFeeTotal
		cur.Breakdown.RetainedStock.TransactionFeeTotal += row.Breakdown.RetainedStock.TransactionFeeTotal
		cur.Breakdown.RetainedStock.JobCostTotal += row.Breakdown.RetainedStock.JobCostTotal
		cur.Breakdown.RetainedStock.SalesTotal += row.Breakdown.RetainedStock.SalesTotal
		cur.Breakdown.RetainedStock.ProfitLoss += row.Breakdown.RetainedStock.ProfitLoss
		cur.Breakdown.StandaloneRecordedSale.TotalJobs += row.Breakdown.StandaloneRecordedSale.TotalJobs
		cur.Breakdown.StandaloneRecordedSale.ItemBuildCount += row.Breakdown.StandaloneRecordedSale.ItemBuildCount
		cur.Breakdown.StandaloneRecordedSale.BuildCostTotal += row.Breakdown.StandaloneRecordedSale.BuildCostTotal
		cur.Breakdown.StandaloneRecordedSale.BrokersFeeTotal += row.Breakdown.StandaloneRecordedSale.BrokersFeeTotal
		cur.Breakdown.StandaloneRecordedSale.TransactionFeeTotal += row.Breakdown.StandaloneRecordedSale.TransactionFeeTotal
		cur.Breakdown.StandaloneRecordedSale.JobCostTotal += row.Breakdown.StandaloneRecordedSale.JobCostTotal
		cur.Breakdown.StandaloneRecordedSale.SalesTotal += row.Breakdown.StandaloneRecordedSale.SalesTotal
		cur.Breakdown.StandaloneRecordedSale.ProfitLoss += row.Breakdown.StandaloneRecordedSale.ProfitLoss
	}
}

func mergeCorpTimelineBuckets(
	dst map[archivedjobshelpers.CorpBucketKey]*models.CorpBuildStatsTimelineBucket,
	src map[archivedjobshelpers.CorpBucketKey]*models.CorpBuildStatsTimelineBucket,
) {
	for key, row := range src {
		cur := dst[key]
		if cur == nil {
			cloned := *row
			dst[key] = &cloned
			continue
		}
		cur.TransactionCount += row.TransactionCount
		cur.QuantitySold += row.QuantitySold
		cur.SalesTotal += row.SalesTotal
		cur.TransactionFeeTotal += row.TransactionFeeTotal
		cur.BrokersFeeTotal += row.BrokersFeeTotal
		cur.ProfitLoss += row.ProfitLoss
	}
}

func mergeCorpRollupBuckets(
	dst map[archivedjobshelpers.CorpRollupBucketKey]*archivedjobshelpers.RollupMonthlyLineAccumulator,
	src map[archivedjobshelpers.CorpRollupBucketKey]*archivedjobshelpers.RollupMonthlyLineAccumulator,
) {
	for key, row := range src {
		cur := dst[key]
		if cur == nil {
			cloned := *row
			dst[key] = &cloned
			continue
		}
		cur.TransactionCount += row.TransactionCount
		cur.QuantitySold += row.QuantitySold
		cur.SalesTotal += row.SalesTotal
		cur.JobCostTotal += row.JobCostTotal
		if len(row.ExtraCategoryTotals) > 0 {
			if cur.ExtraCategoryTotals == nil {
				cur.ExtraCategoryTotals = map[string]float64{}
			}
			for id, value := range row.ExtraCategoryTotals {
				if id == "" {
					continue
				}
				cur.ExtraCategoryTotals[id] += value
			}
		}
		cur.TransactionFeeTotal += row.TransactionFeeTotal
		cur.BrokersFeeTotal += row.BrokersFeeTotal
		cur.ProfitLoss += row.ProfitLoss
	}
}
