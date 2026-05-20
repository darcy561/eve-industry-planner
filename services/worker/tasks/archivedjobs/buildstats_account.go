package archivedjobs

import (
	"context"
	"fmt"
	"strings"

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

// ProcessDirtyAccountBuildStats rebuilds user_build_stats from snapshots for queued accounts (corp aggregates use ProcessDirtyCorpBuildStats).
// Payload account_id processes exactly one account (cron fan-out). Empty account_id drains up to max_accounts from the dirty queue (legacy batch).
func ProcessDirtyAccountBuildStats(ctx context.Context, task *asynq.Task, deps *esitasks.TaskDependencies) error {
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
	}
	if task == nil {
		return fmt.Errorf("task is nil")
	}
	req, err := esitasks.UnmarshalTaskPayload[natscore.ProcessDirtyAccountBuildStatsRequest](task)
	if err != nil {
		return fmt.Errorf("decode task payload: %w", err)
	}

	_, keyring, h, err := archivedjobshelpers.LoadPipelineCrypto()
	if err != nil {
		return err
	}

	db := deps.Mongo.Database(mongocore.DatabaseName)
	dirtyColl := db.Collection(mongocore.CollectionUserBuildStatsDirtyAccounts)

	var accountIDs []string
	if id := strings.TrimSpace(req.AccountID); id != "" {
		accountIDs = []string{id}
	} else {
		maxAccounts := req.MaxAccounts
		if maxAccounts <= 0 {
			maxAccounts = defaultDirtyAccountBatchSize
		}
		accountIDs, err = archivedjobshelpers.FetchDirtyAccountIDs(ctx, dirtyColl, maxAccounts)
		if err != nil {
			return fmt.Errorf("fetch dirty account ids: %w", err)
		}
	}
	if len(accountIDs) == 0 {
		logs.DebugCtx(ctx, "dirty account build stats: no queued accounts")
		return nil
	}

	snapshotCollCorp := db.Collection(mongocore.CollectionCorpArchivedJobStats)
	snapshotCollUser := db.Collection(mongocore.CollectionUserArchivedJobStats)
	statsCollUser := db.Collection(mongocore.CollectionUserBuildStats)
	userRollupBucketsColl := db.Collection(mongocore.CollectionUserBuildStatsBuckets)

	for _, accountID := range accountIDs {
		if accountID == "" {
			continue
		}
		if err := rebuildPersonalAccountStats(ctx, snapshotCollCorp, snapshotCollUser, statsCollUser, accountID, keyring, h); err != nil {
			return fmt.Errorf("rebuild user_build_stats account_id=%s: %w", accountID, err)
		}
		if err := RebuildUserRollupMonthlyBuckets(ctx, snapshotCollUser, snapshotCollCorp, userRollupBucketsColl, accountID, keyring, h); err != nil {
			return fmt.Errorf("rebuild user rollup buckets account_id=%s: %w", accountID, err)
		}
		if _, err := dirtyColl.DeleteOne(ctx, bson.M{"_id": accountID}); err != nil {
			return fmt.Errorf("clear dirty account queue account_id=%s: %w", accountID, err)
		}
	}
	logs.InfoCtx(ctx, "dirty account build stats complete", "accounts", len(accountIDs), "scoped_account_id", strings.TrimSpace(req.AccountID) != "")
	return nil
}

type buildStatsAccumulator struct {
	TypeID              int
	JobType             int
	TotalJobs           int64
	ItemBuildCount      float64
	BuildCostTotal      float64
	TotalSoldQuantity   float64
	BrokersFeeTotal     float64
	TransactionFeeTotal float64
	JobCostTotal        float64
	SalesTotal float64
}

func loadAccountArchivedJobStats(ctx context.Context, snapshotColl *mongo.Collection, accountID string) ([]models.ArchivedJobStats, error) {
	findFilter := bson.M{
		"accountID": accountID,
		"revoked":   bson.M{"$ne": true},
	}
	cursor, err := snapshotColl.Find(ctx, findFilter)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var docs []models.ArchivedJobStats
	if err := cursor.All(ctx, &docs); err != nil {
		return nil, err
	}
	return docs, nil
}

func rebuildPersonalAccountStats(ctx context.Context, snapshotCollCorp, snapshotCollUser, statsCollUser *mongo.Collection, accountID string, keyring *corecrypto.Keyring, h *authzhmac.Helper) error {
	docsUser, err := loadAccountArchivedJobStats(ctx, snapshotCollUser, accountID)
	if err != nil {
		return err
	}
	docsArchived, err := loadAccountArchivedJobStats(ctx, snapshotCollCorp, accountID)
	if err != nil {
		return err
	}
	legacyPersonal := make([]models.ArchivedJobStats, 0, len(docsArchived))
	for _, d := range docsArchived {
		if !archivedjobshelpers.ArchivedJobStatsContributesToCorpBuildStats(d, keyring, h) {
			legacyPersonal = append(legacyPersonal, d)
		}
	}
	combined := mergeArchivedJobStatsByID(docsUser, legacyPersonal)
	return rebuildAccountStatsFromDocs(ctx, statsCollUser, accountID, combined)
}

func accumulateArchivedJobStatsInto(row *buildStatsAccumulator, doc models.ArchivedJobStats) {
	if row.TypeID == 0 {
		row.TypeID = doc.TypeID
	}
	if row.JobType == 0 && doc.JobType != 0 {
		row.JobType = doc.JobType
	}
	row.TotalJobs++
	row.ItemBuildCount += doc.TotalProduced
	row.BuildCostTotal += doc.TotalBuildCosts
	row.JobCostTotal += (doc.TotalBuildCosts + doc.TotalInstallCost + doc.TotalExtras + doc.TotalInventionCost)

	for _, t := range doc.TransactionLines {
		row.TotalSoldQuantity += t.Quantity
		row.SalesTotal += t.Amount
		row.TransactionFeeTotal += t.Tax
	}
	for _, f := range doc.FeeLines {
		row.BrokersFeeTotal += f.Amount
	}
}

func getOrCreateSegmentAcc(m map[int]*buildStatsAccumulator, typeID, jobType int) *buildStatsAccumulator {
	row := m[typeID]
	if row == nil {
		row = &buildStatsAccumulator{TypeID: typeID, JobType: jobType}
		if jobType != 0 {
			row.JobType = jobType
		}
		m[typeID] = row
	}
	return row
}

func accumulatorToSegmentTotals(row *buildStatsAccumulator) models.BuildStatsSegmentTotals {
	if row == nil {
		return models.BuildStatsSegmentTotals{}
	}
	net := archivedjobshelpers.NetArchivedProfitLoss(
		row.SalesTotal, row.BrokersFeeTotal, row.TransactionFeeTotal, row.JobCostTotal)
	return models.BuildStatsSegmentTotals{
		TotalJobs:           row.TotalJobs,
		ItemBuildCount:      row.ItemBuildCount,
		BuildCostTotal:      row.BuildCostTotal,
		TotalSoldQuantity:   row.TotalSoldQuantity,
		BrokersFeeTotal:     row.BrokersFeeTotal,
		TransactionFeeTotal: row.TransactionFeeTotal,
		JobCostTotal:        row.JobCostTotal,
		SalesTotal:          row.SalesTotal,
		ProfitLoss:          net,
	}
}

func mergeArchivedJobStatsByID(primary, secondary []models.ArchivedJobStats) []models.ArchivedJobStats {
	byID := make(map[string]models.ArchivedJobStats, len(primary)+len(secondary))
	for _, d := range secondary {
		if d.ID != "" {
			byID[d.ID] = d
		}
	}
	for _, d := range primary {
		if d.ID != "" {
			byID[d.ID] = d
		}
	}
	out := make([]models.ArchivedJobStats, 0, len(byID))
	for _, d := range byID {
		out = append(out, d)
	}
	return out
}

func rebuildAccountStatsFromDocs(ctx context.Context, statsColl interface {
	BulkWrite(context.Context, []mongo.WriteModel, ...*options.BulkWriteOptions) (*mongo.BulkWriteResult, error)
	DeleteMany(context.Context, interface{}, ...*options.DeleteOptions) (*mongo.DeleteResult, error)
}, accountID string, docs []models.ArchivedJobStats) error {
	acc := map[int]*buildStatsAccumulator{}
	segProd := map[int]*buildStatsAccumulator{}
	segRetained := map[int]*buildStatsAccumulator{}
	segStandalone := map[int]*buildStatsAccumulator{}

	for _, doc := range docs {
		row := acc[doc.TypeID]
		if row == nil {
			row = &buildStatsAccumulator{TypeID: doc.TypeID, JobType: doc.JobType}
			acc[doc.TypeID] = row
		}
		accumulateArchivedJobStatsInto(row, doc)

		switch archivedjobshelpers.ClassifyArchivedJobStatsSegment(doc) {
		case archivedjobshelpers.SegmentProductionChain:
			accumulateArchivedJobStatsInto(getOrCreateSegmentAcc(segProd, doc.TypeID, doc.JobType), doc)
		case archivedjobshelpers.SegmentRetainedStock:
			accumulateArchivedJobStatsInto(getOrCreateSegmentAcc(segRetained, doc.TypeID, doc.JobType), doc)
		case archivedjobshelpers.SegmentStandaloneRecordedSale:
			accumulateArchivedJobStatsInto(getOrCreateSegmentAcc(segStandalone, doc.TypeID, doc.JobType), doc)
		}
	}

	writeModels := make([]mongo.WriteModel, 0, len(acc))
	keepIDs := make([]string, 0, len(acc))
	for typeID, row := range acc {
		statsID := mongocore.BuildStatsDocumentID(accountID, typeID)
		keepIDs = append(keepIDs, statsID)
		bd := models.BuildStatsBreakdown{
			ProductionChain:        accumulatorToSegmentTotals(segProd[typeID]),
			RetainedStock:          accumulatorToSegmentTotals(segRetained[typeID]),
			StandaloneRecordedSale: accumulatorToSegmentTotals(segStandalone[typeID]),
		}
		headlineNet := archivedjobshelpers.NetArchivedProfitLoss(
			row.SalesTotal, row.BrokersFeeTotal, row.TransactionFeeTotal, row.JobCostTotal)
		writeModels = append(writeModels, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": statsID}).
			SetUpdate(bson.M{"$set": bson.M{
				"_id":                 statsID,
				"jobType":             row.JobType,
				"typeID":              row.TypeID,
				"totalJobs":           row.TotalJobs,
				"itemBuildCount":      row.ItemBuildCount,
				"buildCostTotal":      row.BuildCostTotal,
				"brokersFeeTotal":     row.BrokersFeeTotal,
				"transactionFeeTotal": row.TransactionFeeTotal,
				"jobCostTotal":        row.JobCostTotal,
				"salesTotal":          row.SalesTotal,
				"profitLoss":          headlineNet,
				"breakdown":           bd,
			}}).
			SetUpsert(true))
	}
	if len(writeModels) > 0 {
		if _, err := statsColl.BulkWrite(ctx, writeModels, options.BulkWrite().SetOrdered(false)); err != nil {
			return err
		}
	}

	prefixRegex := fmt.Sprintf("^%s\\|", strings.ReplaceAll(accountID, "|", "\\|"))
	deleteFilter := bson.M{"_id": bson.M{"$regex": prefixRegex}}
	if len(keepIDs) > 0 {
		deleteFilter["_id"] = bson.M{"$regex": prefixRegex, "$nin": keepIDs}
	}
	if _, err := statsColl.DeleteMany(ctx, deleteFilter); err != nil {
		return err
	}
	return nil
}
