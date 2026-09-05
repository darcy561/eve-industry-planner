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
//
// A row is keyed by its job, so a write lands on whatever that job left behind
// the last time it was archived. Its figures are replaced either way — but the
// two lifecycle stamps are `omitempty` pointers, so a row that carries neither
// writes neither, and the previous values survive underneath the new figures.
//
// That produces a row nothing has counted which claims to have been counted: a
// job restored and archived again keeps its old figures in the aggregates and
// offers the fold nothing to correct it with. So each stamp is set when the row
// carries one and removed when it does not, which makes the stored row say
// exactly what the written row says.
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
		setDoc := buildSetDoc(doc, "_id", "_meta")
		setOnInsert := bson.M{"_id": row.ID}
		applyLastModified(setDoc, setOnInsert, doc, true)

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
//
// The figures stay — the job is still archived — so without the stamp a stale
// row is indistinguishable from a current one: the aggregates agree with it and
// reconciliation reports no drift.
//
// Existing rows only. A row carrying no figures would fold as a contributor of
// nothing, adding a count to every bucket it touched.
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
			bson.M{"_id": bson.M{"$in": ids}, "owner.kind": owner.Kind, "owner.id": owner.ID},
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
