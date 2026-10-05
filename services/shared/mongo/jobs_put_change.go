package mongo

import (
	"context"
	"errors"
	"fmt"
	"time"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// errChangeStale aborts a one-change transaction when one of its writes no longer applies.
var errChangeStale = errors.New("a job in the change has moved")

// storedRevisionRow is a job document read for nothing but its id and revision.
type storedRevisionRow struct {
	ID   string `bson:"_id"`
	Meta struct {
		Revision int64 `bson:"revision"`
	} `bson:"_meta"`
}

// WriteJobChange writes whole jobs, changed fields and new jobs into one planner as one transaction;
// when any job has moved it writes none and names every job in the change that has.
func (m *Mongo) WriteJobChange(ctx context.Context, owner models.Owner, accountID string, whole []models.Job, fields []JobFieldWrite, now time.Time, sessionID, wsClientID string) (int64, []string, []RevisionConflict, error) {
	if m == nil {
		return 0, nil, nil, fmt.Errorf("WriteJobChange: invalid arguments")
	}
	d := m.JobDocuments
	if _, err := d.requireColl(); err != nil || accountID == "" || owner.IsZero() {
		return 0, nil, nil, fmt.Errorf("WriteJobChange: invalid arguments")
	}

	writes, failed := planJobDocumentWrites(owner, accountID, whole, now, sessionID, wsClientID)
	fieldWrites, fieldFailed := planJobFieldWrites(owner, accountID, fields, now, sessionID, wsClientID)
	writes = append(writes, fieldWrites...)
	failed = append(failed, fieldFailed...)
	if len(failed) > 0 {
		return 0, failed, nil, nil
	}

	var tripped conditionalJobWrite
	err := m.InTransaction(ctx, func(txCtx context.Context) error {
		for _, write := range writes {
			landed, err := d.writeInChange(txCtx, owner, write)
			if err != nil {
				return err
			}
			if !landed {
				tripped = write
				return errChangeStale
			}
		}
		return nil
	})
	if errors.Is(err, errChangeStale) {
		conflicts, cerr := d.staleInChange(ctx, owner, writes, tripped)
		return 0, nil, conflicts, cerr
	}
	if err != nil {
		return 0, nil, nil, err
	}
	return int64(len(writes)), nil, nil, nil
}

// writeInChange makes one write of a change, reporting whether it applied: a job read at a
// revision must still be at it, and a new job must not already exist.
func (d *Docs) writeInChange(ctx context.Context, owner models.Owner, write conditionalJobWrite) (bool, error) {
	if write.expected > 0 {
		res, err := RetryValue(ctx, "ConditionalUpsertJobInChange", func() (*mongo.UpdateResult, error) {
			return d.coll.UpdateOne(ctx, conditionalJobFilter(owner, write), write.update)
		})
		if err != nil {
			return false, fmt.Errorf("conditional write %s: %w", write.jobID, err)
		}
		return res.MatchedCount > 0, nil
	}
	_, err := RetryValue(ctx, "CreateJobInChange", func() (*mongo.UpdateResult, error) {
		return d.coll.UpdateOne(ctx, bson.M{
			"_id":             OwnerScopedDocumentID(owner, write.jobID),
			FieldMetaRevision: bson.M{"$exists": false},
		}, write.update, options.UpdateOne().SetUpsert(true))
	})
	if mongo.IsDuplicateKeyError(err) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("create %s: %w", write.jobID, err)
	}
	return true, nil
}

// staleInChange reads where every job in a refused change now stands and names those it no longer
// applies to, always including the write that refused it.
func (d *Docs) staleInChange(ctx context.Context, owner models.Owner, writes []conditionalJobWrite, tripped conditionalJobWrite) ([]RevisionConflict, error) {
	ids := make([]string, 0, len(writes))
	for _, write := range writes {
		ids = append(ids, OwnerScopedDocumentID(owner, write.jobID))
	}
	rows, err := findAll[storedRevisionRow](ctx, d, "staleInChange",
		bson.M{"_id": bson.M{"$in": ids}},
		options.Find().SetProjection(bson.M{FieldMetaRevision: 1}))
	if err != nil {
		return nil, err
	}
	stored := make(map[string]int64, len(rows))
	for _, row := range rows {
		stored[row.ID] = row.Meta.Revision
	}

	var conflicts []RevisionConflict
	for _, write := range writes {
		current, found := stored[OwnerScopedDocumentID(owner, write.jobID)]
		moved := found != (write.expected > 0) || (found && current != write.expected)
		if !moved && write.jobID != tripped.jobID {
			continue
		}
		conflicts = append(conflicts, RevisionConflict{
			JobID:    write.jobID,
			Expected: write.expected,
			Current:  current,
			Gone:     write.expected > 0 && !found,
		})
	}
	return conflicts, nil
}
