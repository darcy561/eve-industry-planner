package mongo

import (
	"context"
	"fmt"
	"maps"
	"time"

	"eve-industry-planner/shared/documentschema"
	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// bucketRowCountField counts the rows contributing to a monthly bucket.
//
// Emptiness is decided on this rather than on the measures: subtracting float64
// leaves a residue rather than zero, so a document that should be gone would
// never match a test for zero money and would accumulate instead. A count is
// exact.
const bucketRowCountField = "contributingRows"

// ApplyStatsDelta adds a contribution to an owner's aggregates and stamps the
// rows it came from as counted.
//
// The delta is derived by the caller, from the same folds a rebuild uses, so the
// arithmetic has one owner and this only writes it.
//
// The stamp is written alongside the increments, so a row cannot be counted
// twice: whatever else happens, a stamped row is never offered as outstanding
// work again.
func (m *Mongo) ApplyStatsDelta(ctx context.Context, owner models.Owner, delta models.StatsDelta, rowIDs []string, now time.Time) error {
	if m == nil || m.StatisticsTimeline == nil || m.StatisticsRows == nil {
		return fmt.Errorf("mongo handle is required")
	}
	if err := owner.Validate(); err != nil {
		return err
	}
	if delta.IsZero() && len(rowIDs) == 0 {
		return nil
	}

	if err := m.incrementBuckets(ctx, owner, delta); err != nil {
		return err
	}
	if err := m.incrementTotals(ctx, owner, delta); err != nil {
		return err
	}
	return m.StampContributed(ctx, rowIDs, now)
}

func (m *Mongo) incrementBuckets(ctx context.Context, owner models.Owner, delta models.StatsDelta) error {
	if len(delta.Buckets) == 0 {
		return nil
	}
	coll, err := m.StatisticsTimeline.requireColl()
	if err != nil {
		return err
	}

	writes := make([]mongo.WriteModel, 0, len(delta.Buckets))
	for key, bucket := range delta.Buckets {
		id := TimelineMonthDocumentID(owner, key.TypeID, key.Year, key.Month, key.IsProductionChain)
		inc := measureIncrements(bucket.Measures)
		inc[bucketRowCountField] = bucket.Rows

		update := bson.M{
			"$inc": inc,
			"$setOnInsert": bson.M{
				"owner.kind":        owner.Kind,
				"owner.id":          owner.ID,
				"typeID":            key.TypeID,
				"isProductionChain": key.IsProductionChain,
				"year":              key.Year,
				"month":             key.Month,
			},
		}
		// Names are set, not incremented — and a removal carries them too, so a
		// bucket that keeps other contributions keeps their names with it.
		if named := categoryLabelSets(bucket.Measures.ExtraCategoryLabels); len(named) > 0 {
			update["$set"] = named
		}

		writes = append(writes, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": id}).
			SetUpdate(update).
			SetUpsert(true))
	}

	return Retry(ctx, applyRetryOptions("ApplyRowDeltasBuckets", nil), func() error {
		_, werr := coll.BulkWrite(ctx, writes, options.BulkWrite().SetOrdered(false))
		return werr
	})
}

// incrementTotals adds a contribution to the lifetime totals per item type.
//
// The measures and the segment a row is credited to are incremented; the build
// history marks are not, because a minimum and a maximum cannot be moved by
// addition. They are recomputed by the caller, which can read the rows.
func (m *Mongo) incrementTotals(ctx context.Context, owner models.Owner, delta models.StatsDelta) error {
	if len(delta.Totals) == 0 {
		return nil
	}
	coll, err := m.StatisticsTotals.requireColl()
	if err != nil {
		return err
	}

	writes := make([]mongo.WriteModel, 0, len(delta.Totals))
	for key, total := range delta.Totals {
		inc := buildMeasureIncrements("", total.Measures)
		if key.Segment != "" {
			maps.Copy(inc, buildMeasureIncrements("breakdown."+key.Segment+".", total.Measures))
			if total.SoldQty != 0 {
				inc["breakdown."+key.Segment+".totalSoldQuantity"] = total.SoldQty
			}
		}

		writes = append(writes, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": ProductionTotalsDocumentID(owner, key.TypeID)}).
			SetUpdate(bson.M{
				"$inc": inc,
				"$setOnInsert": bson.M{
					"owner.kind": owner.Kind, "owner.id": owner.ID,
					"typeID":  key.TypeID,
					"jobType": total.JobType,
				},
			}).
			SetUpsert(true))
	}

	return Retry(ctx, applyRetryOptions("ApplyStatsDeltaTotals", nil), func() error {
		_, werr := coll.BulkWrite(ctx, writes, options.BulkWrite().SetOrdered(false))
		return werr
	})
}

// SetBuildHistoryMarks replaces one item type's marks with a freshly computed set.
//
// Marks are replaced rather than incremented because a cheapest and a dearest
// cannot be moved by addition, and removing the cheapest build leaves nothing in
// a counter to recover the next one from. A type holds few rows — a couple on
// average — so recomputing them is cheaper than any scheme for maintaining them
// in place.
func (m *Mongo) SetBuildHistoryMarks(ctx context.Context, owner models.Owner, typeID int, marks models.BuildHistoryMarks) error {
	if m == nil || m.StatisticsTotals == nil {
		return fmt.Errorf("mongo handle is required")
	}
	coll, err := m.StatisticsTotals.requireColl()
	if err != nil {
		return err
	}
	return Retry(ctx, applyRetryOptions("SetBuildHistoryMarks", nil), func() error {
		_, uerr := coll.UpdateOne(ctx,
			bson.M{"_id": ProductionTotalsDocumentID(owner, typeID)},
			bson.M{"$set": bson.M{"history": marks}},
		)
		return uerr
	})
}

// LoadUncountedStatsRows reads the rows whose figures are not yet in the
// aggregates — the outstanding work, described by the absence of the stamp that
// applying them writes.
//
// The filter is [models.ArchivedJobStats.AwaitsContribution] expressed as a
// query; the two have to keep saying the same thing.
func (m *Mongo) LoadUncountedStatsRows(ctx context.Context, owner models.Owner) ([]models.ArchivedJobStats, error) {
	if m == nil || m.StatisticsRows == nil {
		return nil, fmt.Errorf("mongo handle is required")
	}
	coll, err := m.StatisticsRows.requireColl()
	if err != nil {
		return nil, err
	}

	var out []models.ArchivedJobStats
	err = Retry(ctx, applyRetryOptions("LoadUncountedStatsRows", nil), func() error {
		out = nil
		cursor, ferr := coll.Find(ctx, bson.M{
			"owner.kind":    owner.Kind,
			"owner.id":      owner.ID,
			"contributedAt": bson.M{"$exists": false},
			"revoked":       bson.M{"$ne": true},
		})
		if ferr != nil {
			return ferr
		}
		defer cursor.Close(ctx)
		return cursor.All(ctx, &out)
	})
	return upgradeStatsRows(out), err
}

// LoadRevokedContributedRows reads rows whose figures are still counted but whose
// job is no longer archived — the removals outstanding.
//
// The filter is [models.ArchivedJobStats.AwaitsRemoval] expressed as a query.
//
// Revoking a row and taking its figures back out are separate steps: the first
// happens where the job is restored, the second where statistics are written, and
// the stamp is what carries the work between them.
func (m *Mongo) LoadRevokedContributedRows(ctx context.Context, owner models.Owner) ([]models.ArchivedJobStats, error) {
	if m == nil || m.StatisticsRows == nil {
		return nil, fmt.Errorf("mongo handle is required")
	}
	coll, err := m.StatisticsRows.requireColl()
	if err != nil {
		return nil, err
	}

	var out []models.ArchivedJobStats
	err = Retry(ctx, applyRetryOptions("LoadRevokedContributedRows", nil), func() error {
		out = nil
		cursor, ferr := coll.Find(ctx, bson.M{
			"owner.kind":    owner.Kind,
			"owner.id":      owner.ID,
			"revoked":       true,
			"contributedAt": bson.M{"$exists": true},
		})
		if ferr != nil {
			return ferr
		}
		defer cursor.Close(ctx)
		return cursor.All(ctx, &out)
	})
	return upgradeStatsRows(out), err
}

// ClearContributedStamp records that these rows' figures are no longer counted.
func (m *Mongo) ClearContributedStamp(ctx context.Context, rowIDs []string) error {
	if len(rowIDs) == 0 {
		return nil
	}
	coll, err := m.StatisticsRows.requireColl()
	if err != nil {
		return err
	}
	return Retry(ctx, applyRetryOptions("ClearContributedStamp", nil), func() error {
		_, uerr := coll.UpdateMany(ctx,
			bson.M{"_id": bson.M{"$in": rowIDs}},
			bson.M{"$unset": bson.M{"contributedAt": ""}},
		)
		return uerr
	})
}

// RevokeStatsRowsForJobs marks the rows of jobs that are no longer archived.
//
// The rows are kept rather than deleted so a rebuild can tell "removed" from
// "never seen", and so the figures they contributed can be found and taken back
// out.
func (m *Mongo) RevokeStatsRowsForJobs(ctx context.Context, owner models.Owner, jobIDs []string, now time.Time) (int64, error) {
	if m == nil || m.StatisticsRows == nil {
		return 0, fmt.Errorf("mongo handle is required")
	}
	if len(jobIDs) == 0 {
		return 0, nil
	}
	coll, err := m.StatisticsRows.requireColl()
	if err != nil {
		return 0, err
	}

	ids := make([]string, 0, len(jobIDs))
	for _, jobID := range jobIDs {
		ids = append(ids, ArchivedJobStatsDocumentID(owner, jobID))
	}

	var modified int64
	err = Retry(ctx, applyRetryOptions("RevokeStatsRowsForJobs", nil), func() error {
		modified = 0
		res, uerr := coll.UpdateMany(ctx,
			bson.M{"_id": bson.M{"$in": ids}, "revoked": bson.M{"$ne": true}},
			bson.M{"$set": bson.M{"revoked": true, "revokedAt": now.UTC()}},
		)
		if uerr != nil {
			return uerr
		}
		if res != nil {
			modified = res.ModifiedCount
		}
		return nil
	})
	return modified, err
}

// LoadTypeStatsRows reads one item type's statistics rows, the input the marks
// are recomputed from.
func (m *Mongo) LoadTypeStatsRows(ctx context.Context, owner models.Owner, typeID int) ([]models.ArchivedJobStats, error) {
	if m == nil || m.StatisticsRows == nil {
		return nil, fmt.Errorf("mongo handle is required")
	}
	coll, err := m.StatisticsRows.requireColl()
	if err != nil {
		return nil, err
	}

	var out []models.ArchivedJobStats
	err = Retry(ctx, applyRetryOptions("LoadTypeStatsRows", nil), func() error {
		out = nil
		cursor, ferr := coll.Find(ctx, bson.M{"owner.kind": owner.Kind, "owner.id": owner.ID, "typeID": typeID, "revoked": bson.M{"$ne": true}})
		if ferr != nil {
			return ferr
		}
		defer cursor.Close(ctx)
		return cursor.All(ctx, &out)
	})
	return upgradeStatsRows(out), err
}

// buildMeasureIncrements renders build measures as $inc fields under a prefix.
func buildMeasureIncrements(prefix string, m models.BuildMeasures) bson.M {
	inc := bson.M{}
	if m.TotalJobs != 0 {
		inc[prefix+"totalJobs"] = m.TotalJobs
	}
	for field, value := range map[string]float64{
		"itemBuildCount":      m.ItemBuildCount,
		"buildCostTotal":      m.BuildCostTotal,
		"brokersFeeTotal":     m.BrokersFeeTotal,
		"transactionFeeTotal": m.TransactionFeeTotal,
		"jobCostTotal":        m.JobCostTotal,
		"salesTotal":          m.SalesTotal,
		"profitLoss":          m.ProfitLoss,
	} {
		if value != 0 {
			inc[prefix+field] = value
		}
	}
	return inc
}

// StampContributed records that these rows' figures are in the aggregates.
func (m *Mongo) StampContributed(ctx context.Context, rowIDs []string, now time.Time) error {
	if len(rowIDs) == 0 {
		return nil
	}
	coll, err := m.StatisticsRows.requireColl()
	if err != nil {
		return err
	}
	return Retry(ctx, applyRetryOptions("StampContributed", nil), func() error {
		_, uerr := coll.UpdateMany(ctx,
			bson.M{"_id": bson.M{"$in": rowIDs}},
			bson.M{"$set": bson.M{"contributedAt": now.UTC()}},
		)
		return uerr
	})
}

// PruneEmptyTotals removes an item type's lifetime totals once no job of that
// type is archived any more.
//
// Without it a restored job leaves a row of zeros behind, and an absent row and
// an all-zero row mean different things: the totals read serves what it finds, so
// the item keeps appearing — with nothing to show — in every view that lists what
// an owner has built.
//
// Decided on the job count, which is an integer and exact. The money fields
// cannot answer it: subtracting float64 leaves a residue rather than zero, so a
// row that should be gone would never match.
func (m *Mongo) PruneEmptyTotals(ctx context.Context, owner models.Owner) (int64, error) {
	if m == nil || m.StatisticsTotals == nil {
		return 0, fmt.Errorf("mongo handle is required")
	}
	coll, err := m.StatisticsTotals.requireColl()
	if err != nil {
		return 0, err
	}

	var deleted int64
	err = Retry(ctx, applyRetryOptions("PruneEmptyTotals", nil), func() error {
		deleted = 0
		res, derr := coll.DeleteMany(ctx, bson.M{
			"owner.kind": owner.Kind, "owner.id": owner.ID,
			"totalJobs": bson.M{"$lte": 0},
		})
		if derr != nil {
			return derr
		}
		if res != nil {
			deleted = res.DeletedCount
		}
		return nil
	})
	return deleted, err
}

// PruneEmptyBuckets removes monthly buckets nothing contributes to any more.
//
// Run after a removal rather than during it: the count reaching zero is what
// makes a bucket empty, and that is only known once every row's removal has been
// applied.
func (m *Mongo) PruneEmptyBuckets(ctx context.Context, owner models.Owner) (int64, error) {
	if m == nil || m.StatisticsTimeline == nil {
		return 0, fmt.Errorf("mongo handle is required")
	}
	coll, err := m.StatisticsTimeline.requireColl()
	if err != nil {
		return 0, err
	}

	var deleted int64
	err = Retry(ctx, applyRetryOptions("PruneEmptyBuckets", nil), func() error {
		deleted = 0
		res, derr := coll.DeleteMany(ctx, bson.M{
			"owner.kind":        owner.Kind,
			"owner.id":          owner.ID,
			bucketRowCountField: bson.M{"$lte": 0},
		})
		if derr != nil {
			return derr
		}
		if res != nil {
			deleted = res.DeletedCount
		}
		return nil
	})
	return deleted, err
}

// measureIncrements renders a set of measures as the $inc document that adds
// them, skipping fields that would add nothing.
func measureIncrements(m models.SalesMeasures) bson.M {
	inc := bson.M{}
	add := func(field string, value float64) {
		if value != 0 {
			inc[field] = value
		}
	}
	if m.TransactionCount != 0 {
		inc["transactionCount"] = m.TransactionCount
	}
	add("quantitySold", m.QuantitySold)
	add("salesTotal", m.SalesTotal)
	add("quantityProduced", m.QuantityProduced)
	add("jobCostTotal", m.JobCostTotal)
	add("materialCostTotal", m.MaterialCostTotal)
	add("inventionCostTotal", m.InventionCostTotal)
	add("installCostTotal", m.InstallCostTotal)
	add("extrasTotal", m.ExtrasTotal)
	add("transactionFeeTotal", m.TransactionFeeTotal)
	add("brokersFeeTotal", m.BrokersFeeTotal)
	add("profitLoss", m.ProfitLoss)
	for category, value := range m.ExtraCategoryTotals {
		add("extraCategoryTotals."+category, value)
	}
	return inc
}

// EachArchivedJobWithoutStatsRow walks the owner's archived jobs whose job id
// is not in have, handing each to fn.
//
// The caller supplies what it already knows about rather than this reading them
// again: its only other caller has just loaded every row for the owner, and
// two reads of one collection to answer one question is one too many. One
// id-only read decides which jobs are missing, so a pass that finds nothing new
// loads no job document at all.
func (m *Mongo) EachArchivedJobWithoutStatsRow(ctx context.Context, owner models.Owner, have map[string]struct{}, fn func(models.Job) error) error {
	if m == nil || m.ArchivedJobs == nil {
		return fmt.Errorf("mongo handle is required")
	}
	if err := owner.Validate(); err != nil {
		return err
	}
	if fn == nil {
		return fmt.Errorf("a visitor is required")
	}

	jobIDs, err := m.ArchivedJobs.ListIDs(ctx, archivedJobsOwnedBy(owner))
	if err != nil {
		return fmt.Errorf("list archived jobs: %w", err)
	}

	missing := make([]string, 0)
	for _, jobID := range jobIDs {
		if _, ok := have[jobID]; !ok {
			missing = append(missing, jobID)
		}
	}
	if len(missing) == 0 {
		return nil
	}

	coll, err := m.ArchivedJobs.requireColl()
	if err != nil {
		return err
	}
	filter := archivedJobsOwnedBy(owner)
	filter["_id"] = bson.M{"$in": missing}

	cursor, err := coll.Find(ctx, filter)
	if err != nil {
		return err
	}
	defer cursor.Close(ctx)
	for cursor.Next(ctx) {
		var job models.Job
		if decErr := cursor.Decode(&job); decErr != nil {
			return decErr
		}
		if fnErr := fn(job); fnErr != nil {
			return fnErr
		}
	}
	return cursor.Err()
}

// upgradeStatsRows brings rows to the current shape as they are read.
//
// Rows written before the owner existed carry only accountID. Every reader goes
// through here rather than each one remembering, because a row without an owner
// reaching a caller looks like a row nobody owns.
func upgradeStatsRows(rows []models.ArchivedJobStats) []models.ArchivedJobStats {
	upgrader := documentschema.Upgrader{}
	for i := range rows {
		upgrader.ArchivedJobStats(&rows[i])
	}
	return rows
}

// categoryLabelSets renders the names as the $set paths that record them, keyed
// per category so one name is written without disturbing another's.
func categoryLabelSets(labels map[string]string) bson.M {
	if len(labels) == 0 {
		return nil
	}
	set := make(bson.M, len(labels))
	for category, label := range labels {
		if label == "" {
			continue
		}
		set["extraCategoryLabels."+category] = label
	}
	return set
}
