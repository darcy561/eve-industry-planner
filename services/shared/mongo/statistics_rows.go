package mongo

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// statsRowLifecycleFields describe where a row is in its life rather than what
// the job it came from is worth.
var statsRowLifecycleFields = []string{"contributedAt", "revokedAt", "skippedAt", "skipReason"}

// WriteStatsRows writes statistics rows derived from archived jobs.
func (m *Mongo) WriteStatsRows(ctx context.Context, rows []models.ArchivedJobStats, batchSize int) error {
	if m == nil || m.StatisticsRows == nil {
		return fmt.Errorf("mongo handle is required")
	}
	if len(rows) == 0 {
		return nil
	}
	if batchSize <= 0 {
		batchSize = len(rows)
	}
	coll, err := m.StatisticsRows.requireColl()
	if err != nil {
		return err
	}

	writes := make([]mongo.WriteModel, 0, len(rows))
	for _, row := range rows {
		if row.ID == "" {
			return fmt.Errorf("statistics row has no id (jobID=%s)", row.JobID)
		}
		doc, derr := StructToMongoDoc(row, row.ID)
		if derr != nil {
			return fmt.Errorf("convert statistics row: %w", derr)
		}
		setDoc := buildSetDoc(doc, "_id")
		setOnInsert := bson.M{"_id": row.ID}
		applyLastModified(setDoc, nil, nil, false)

		unset := bson.M{}
		for _, field := range statsRowLifecycleFields {
			if _, written := setDoc[field]; !written {
				unset[field] = ""
			}
		}

		update := bson.M{"$set": setDoc, "$setOnInsert": setOnInsert}
		if len(unset) > 0 {
			update["$unset"] = unset
		}
		writes = append(writes, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": row.ID}).
			SetUpdate(update).
			SetUpsert(true))
	}

	for start := 0; start < len(writes); start += batchSize {
		end := min(start+batchSize, len(writes))
		batch := writes[start:end]
		if err := Retry(ctx, applyRetryOptions("WriteStatsRows", nil), func() error {
			_, werr := coll.BulkWrite(ctx, batch, options.BulkWrite().SetOrdered(false))
			return werr
		}); err != nil {
			return fmt.Errorf("write statistics rows: %w", err)
		}
	}
	return nil
}

// StampSkippedStatsRows marks rows whose job could not be reduced this pass.
func (m *Mongo) StampSkippedStatsRows(ctx context.Context, owner models.Owner, jobIDs []string, reason string, now time.Time) (stamped int64, err error) {
	if m == nil || m.StatisticsRows == nil {
		return 0, fmt.Errorf("mongo handle is required")
	}
	if err := owner.Validate(); err != nil {
		return 0, err
	}
	if len(jobIDs) == 0 {
		return 0, nil
	}
	coll, cerr := m.StatisticsRows.requireColl()
	if cerr != nil {
		return 0, cerr
	}

	ids := make([]string, 0, len(jobIDs))
	for _, jobID := range jobIDs {
		ids = append(ids, ArchivedJobStatsDocumentID(owner, jobID))
	}

	err = Retry(ctx, applyRetryOptions("StampSkippedStatsRows", nil), func() error {
		res, uerr := coll.UpdateMany(ctx,
			OwnerFilter(owner, bson.M{"_id": bson.M{"$in": ids}}),
			bson.M{"$set": bson.M{"skippedAt": now.UTC(), "skipReason": reason}})
		if uerr != nil {
			return uerr
		}
		stamped = res.MatchedCount
		return nil
	})
	if err != nil {
		return 0, fmt.Errorf("stamp skipped statistics rows: %w", err)
	}
	return stamped, nil
}
