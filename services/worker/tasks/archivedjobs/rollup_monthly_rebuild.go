package archivedjobs

import (
	"context"
	"fmt"
	"strings"

	authzhmac "eve-industry-planner/shared/core/crypto/authzhmac/helper"
	corecrypto "eve-industry-planner/shared/core/crypto/aesgcm"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/models"
	archivedjobshelpers "eve-industry-planner/worker/tasks/archivedjobs/helpers"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func personalSnapshotFilter(accountID string) bson.M {
	return bson.M{
		"accountID":         accountID,
		"revoked":           bson.M{"$ne": true},
		"isProductionChain": bson.M{"$ne": true},
	}
}

// RebuildUserRollupMonthlyBuckets recomputes user_build_stats_buckets for one account from user_archived_job_stats.
func RebuildUserRollupMonthlyBuckets(
	ctx context.Context,
	userSnapColl *mongo.Collection,
	corpSnapColl *mongo.Collection,
	bucketColl *mongo.Collection,
	accountID string,
	keyring *corecrypto.Keyring,
	h *authzhmac.Helper,
) error {
	if accountID == "" {
		return nil
	}

	docsUser, err := loadAccountArchivedJobStats(ctx, userSnapColl, accountID)
	if err != nil {
		return err
	}
	docs := docsUser
	if corpSnapColl != nil {
		docsArchived, err := loadAccountArchivedJobStats(ctx, corpSnapColl, accountID)
		if err != nil {
			return err
		}
		legacyPersonal := make([]models.ArchivedJobStats, 0, len(docsArchived))
		for _, d := range docsArchived {
			if !archivedjobshelpers.ArchivedJobStatsContributesToCorpBuildStats(d, keyring, h) {
				legacyPersonal = append(legacyPersonal, d)
			}
		}
		docs = mergeArchivedJobStatsByID(docsUser, legacyPersonal)
	}

	built := archivedjobshelpers.AccumulateUserRollupMonthly(docs)
	writeModels := make([]mongo.WriteModel, 0, len(built))
	keepIDs := make([]string, 0, len(built))
	for key, acc := range built {
		docID := mongocore.BuildStatsBucketDocumentID(accountID, key.TypeID, key.Year, key.Month)
		keepIDs = append(keepIDs, docID)
		row := models.UserRollupMonthlyBucket{
			ID:                  docID,
			AccountID:           accountID,
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
		}
		writeModels = append(writeModels, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": docID}).
			SetUpdate(bson.M{"$set": row}).
			SetUpsert(true))
	}

	if len(writeModels) > 0 {
		if _, err := bucketColl.BulkWrite(ctx, writeModels, options.BulkWrite().SetOrdered(false)); err != nil {
			return fmt.Errorf("user rollup buckets bulk write account_id=%s: %w", accountID, err)
		}
	}

	prefixRegex := fmt.Sprintf("^%s\\|", strings.ReplaceAll(accountID, "|", "\\|"))
	deleteFilter := bson.M{"_id": bson.M{"$regex": prefixRegex}}
	if len(keepIDs) > 0 {
		deleteFilter["_id"] = bson.M{"$regex": prefixRegex, "$nin": keepIDs}
	}
	if _, err := bucketColl.DeleteMany(ctx, deleteFilter); err != nil {
		return fmt.Errorf("prune user rollup buckets account_id=%s: %w", accountID, err)
	}
	return nil
}

// RebuildCorpRollupMonthlyBuckets recomputes corp_rollup_buckets for dirty corp refs (full corp snapshot corpus).
func RebuildCorpRollupMonthlyBuckets(
	ctx context.Context,
	corpRollColl *mongo.Collection,
	docs []models.ArchivedJobStats,
	dirtyCorpRefs []string,
	h *authzhmac.Helper,
) error {
	if h == nil {
		return fmt.Errorf("hmac helper is required for corp rollup buckets")
	}
	targetSet := make(map[string]struct{}, len(dirtyCorpRefs))
	for _, ref := range dirtyCorpRefs {
		if r := strings.TrimSpace(ref); r != "" {
			targetSet[r] = struct{}{}
		}
	}
	if len(targetSet) == 0 {
		return nil
	}

	built := archivedjobshelpers.AccumulateCorpRollupMonthly(docs, targetSet, h)
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
