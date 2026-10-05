package mongo

import (
	"context"
	"errors"
	"fmt"
	"slices"
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

// JobChange is everything one change writes: whole jobs, changed fields, new jobs and removals.
type JobChange struct {
	Whole   []models.Job
	Fields  []JobFieldWrite
	Deletes []models.JobDeleteBody
}

// changeStep makes one write of a change inside its transaction, reporting whether it applied.
type changeStep func(ctx context.Context, owner models.Owner, write conditionalJobWrite) (bool, error)

// WriteJobChange writes and removes jobs in one planner as one transaction; when any job has moved
// it touches none and names every job in the change that has.
func (m *Mongo) WriteJobChange(ctx context.Context, owner models.Owner, accountID string, change JobChange, now time.Time, sessionID, wsClientID string) (int64, []string, []RevisionConflict, error) {
	if m == nil {
		return 0, nil, nil, fmt.Errorf("WriteJobChange: invalid arguments")
	}
	d := m.JobDocuments
	if _, err := d.requireColl(); err != nil || accountID == "" || owner.IsZero() {
		return 0, nil, nil, fmt.Errorf("WriteJobChange: invalid arguments")
	}

	writes, failed := planJobDocumentWrites(owner, accountID, change.Whole, now, sessionID, wsClientID)
	fieldWrites, fieldFailed := planJobFieldWrites(owner, accountID, change.Fields, now, sessionID, wsClientID)
	deletes, deleteFailed := planJobDeletes(now, sessionID, wsClientID, change.Deletes)
	failed = slices.Concat(failed, fieldFailed, deleteFailed)
	if len(failed) > 0 {
		return 0, failed, nil, nil
	}
	writes = slices.Concat(writes, fieldWrites)

	conflicts, err := m.inJobChange(ctx, owner, func(txCtx context.Context, tripped *conditionalJobWrite) error {
		if err := applyInChange(txCtx, owner, writes, d.writeInChange, tripped); err != nil {
			return err
		}
		return applyInChange(txCtx, owner, deletes, d.deleteInChange, tripped)
	}, slices.Concat(writes, deletes))
	if err != nil || len(conflicts) > 0 {
		return 0, nil, conflicts, err
	}
	return int64(len(writes) + len(deletes)), nil, nil, nil
}

// inJobChange runs a change's steps in one transaction and, when a step no longer applied, names
// every planned job that has moved, read after the abort.
func (m *Mongo) inJobChange(ctx context.Context, owner models.Owner, steps func(context.Context, *conditionalJobWrite) error, planned []conditionalJobWrite) ([]RevisionConflict, error) {
	var tripped conditionalJobWrite
	err := m.InTransaction(ctx, func(txCtx context.Context) error {
		return steps(txCtx, &tripped)
	})
	if errors.Is(err, errChangeStale) {
		return m.JobDocuments.staleInChange(ctx, owner, planned, tripped)
	}
	return nil, err
}

// applyInChange makes each write in order, aborting the change at the first that no longer applies
// and recording it as the one that tripped.
func applyInChange(ctx context.Context, owner models.Owner, writes []conditionalJobWrite, step changeStep, tripped *conditionalJobWrite) error {
	for _, write := range writes {
		landed, err := step(ctx, owner, write)
		if err != nil {
			return err
		}
		if !landed {
			*tripped = write
			return errChangeStale
		}
	}
	return nil
}

// planJobDeletes turns each removal into the stamp it makes before the job goes, and names the
// removals that carry no job or no revision.
func planJobDeletes(now time.Time, sessionID, wsClientID string, removals []models.JobDeleteBody) ([]conditionalJobWrite, []string) {
	stamp := bson.M{"$set": MetaStamp(now, sessionID, wsClientID)}
	planned := make([]conditionalJobWrite, 0, len(removals))
	var failed []string
	for _, remove := range removals {
		if remove.Validate() != nil {
			failed = append(failed, remove.JobID)
			continue
		}
		planned = append(planned, conditionalJobWrite{jobID: remove.JobID, expected: remove.Revision, update: stamp})
	}
	return planned, failed
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

// deleteInChange stamps then removes one job of a change, reporting whether it was still at the
// revision the change read it at.
func (d *Docs) deleteInChange(ctx context.Context, owner models.Owner, remove conditionalJobWrite) (bool, error) {
	res, err := RetryValue(ctx, "StampJobForDeleteInChange", func() (*mongo.UpdateResult, error) {
		return d.coll.UpdateOne(ctx, conditionalJobFilter(owner, remove), remove.update)
	})
	if err != nil {
		return false, fmt.Errorf("stamp %s for delete: %w", remove.jobID, err)
	}
	if res.MatchedCount == 0 {
		return false, nil
	}
	if _, err := RetryValue(ctx, "DeleteJobInChange", func() (*mongo.DeleteResult, error) {
		return d.coll.DeleteOne(ctx, bson.M{"_id": OwnerScopedDocumentID(owner, remove.jobID)})
	}); err != nil {
		return false, fmt.Errorf("delete %s: %w", remove.jobID, err)
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
