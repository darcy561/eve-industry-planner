package indexing

import (
	"context"
	"fmt"

	mongocore "eve-industry-planner/shared/core/mongo"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const (
	archivedJobStatsAccountTypeRevokedIdxName = "accountID_1_typeID_1_isProductionChain_1_revoked_1"
	archivedJobStatsAccountArchivedAtIdxName  = "accountID_1_archivedAt_1_revoked_1"
	archivedJobStatsTxnMonthCorpIdxName = "transactionLines.year_1_transactionLines.month_1_transactionLines.corpStatus_1"

	// Partial: active snapshots with account ownership (rollup / timelines that exclude chain + revoked).
	archivedJobStatsRollupAccountTypePartialIdxName = "accountID_1_typeID_1_rollups_active_partial"
	// Partial: corp-owned snapshot rows keyed by corpRef (corp rollup $or branch).
	archivedJobStatsRollupCorpRefTypePartialIdxName = "corpRef_1_typeID_1_rollups_active_partial"
	// Multikey helpers for corp rollup account branch ($elemMatch on line corp ids).
	archivedJobStatsAccountTxnResolvedCorpIdxName       = "accountID_1_transactionLines.resolvedCorpID_1_rollups_active_partial"
	archivedJobStatsAccountFeeResolvedCorpIdxName       = "accountID_1_feeLines.resolvedCorpID_1_rollups_active_partial"
	archivedJobStatsAccountLinkedIndustryCorpIdxName    = "accountID_1_linkedIndustryCorpIDs_1_rollups_active_partial"
)

// archivedStatsActiveDocFilter targets active snapshots for partial indexes.
// Use equality predicates only; partial indexes reject $ne/$not expressions.
func archivedStatsActiveDocFilter() bson.M {
	return bson.M{
		"revoked":           false,
		"isProductionChain": false,
	}
}

func archivedStatsRollupPartialAccountFilter() bson.M {
	f := archivedStatsActiveDocFilter()
	f["accountID"] = bson.M{"$gt": ""}
	return f
}

func archivedStatsRollupPartialCorpRefFilter() bson.M {
	f := archivedStatsActiveDocFilter()
	f["corpRef"] = bson.M{"$gt": ""}
	return f
}

func EnsureArchivedJobStatsIndexes(ctx context.Context, client *mongo.Client) error {
	if client == nil {
		return fmt.Errorf("mongo client is nil")
	}
	for _, collName := range []string{mongocore.CollectionCorpArchivedJobStats, mongocore.CollectionUserArchivedJobStats} {
		if err := ensureArchivedJobStatsIndexesOnCollection(ctx, client, collName); err != nil {
			return err
		}
	}
	return nil
}

func ensureArchivedJobStatsIndexesOnCollection(ctx context.Context, client *mongo.Client, collName string) error {
	coll := client.Database(mongocore.DatabaseName).Collection(collName)
	indexes := []mongo.IndexModel{
		{
			Keys: bson.D{
				{Key: "accountID", Value: 1},
				{Key: "typeID", Value: 1},
				{Key: "isProductionChain", Value: 1},
				{Key: "revoked", Value: 1},
			},
			Options: options.Index().SetName(archivedJobStatsAccountTypeRevokedIdxName),
		},
		{
			Keys: bson.D{
				{Key: "accountID", Value: 1},
				{Key: "archivedAt", Value: 1},
				{Key: "revoked", Value: 1},
			},
			Options: options.Index().SetName(archivedJobStatsAccountArchivedAtIdxName),
		},
		{
			Keys: bson.D{
				{Key: "transactionLines.year", Value: 1},
				{Key: "transactionLines.month", Value: 1},
				{Key: "transactionLines.corpStatus", Value: 1},
			},
			Options: options.Index().SetName(archivedJobStatsTxnMonthCorpIdxName),
		},
		// Smaller partial index for “all types” rollups and any scan that already filters active rows.
		{
			Keys: bson.D{
				{Key: "accountID", Value: 1},
				{Key: "typeID", Value: 1},
			},
			Options: options.Index().
				SetName(archivedJobStatsRollupAccountTypePartialIdxName).
				SetPartialFilterExpression(archivedStatsRollupPartialAccountFilter()),
		},
	}

	if collName == mongocore.CollectionCorpArchivedJobStats {
		indexes = append(indexes,
			mongo.IndexModel{
				Keys: bson.D{
					{Key: "corpRef", Value: 1},
					{Key: "typeID", Value: 1},
				},
				Options: options.Index().
					SetName(archivedJobStatsRollupCorpRefTypePartialIdxName).
					SetPartialFilterExpression(archivedStatsRollupPartialCorpRefFilter()),
			},
			mongo.IndexModel{
				Keys: bson.D{
					{Key: "accountID", Value: 1},
					{Key: "transactionLines.resolvedCorpID", Value: 1},
				},
				Options: options.Index().
					SetName(archivedJobStatsAccountTxnResolvedCorpIdxName).
					SetPartialFilterExpression(archivedStatsRollupPartialAccountFilter()),
			},
			mongo.IndexModel{
				Keys: bson.D{
					{Key: "accountID", Value: 1},
					{Key: "feeLines.resolvedCorpID", Value: 1},
				},
				Options: options.Index().
					SetName(archivedJobStatsAccountFeeResolvedCorpIdxName).
					SetPartialFilterExpression(archivedStatsRollupPartialAccountFilter()),
			},
			mongo.IndexModel{
				Keys: bson.D{
					{Key: "accountID", Value: 1},
					{Key: "linkedIndustryCorpIDs", Value: 1},
				},
				Options: options.Index().
					SetName(archivedJobStatsAccountLinkedIndustryCorpIdxName).
					SetPartialFilterExpression(archivedStatsRollupPartialAccountFilter()),
			},
		)
	}

	for _, idx := range indexes {
		if _, err := coll.Indexes().CreateOne(ctx, idx); err != nil && !isMongoIndexAlreadyCompatible(err) {
			return fmt.Errorf("create %s index: %w", collName, err)
		}
	}
	return nil
}
