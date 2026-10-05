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

// JobChangeResult counts what a landed change wrote and removed.
type JobChangeResult struct {
	Written int64
	Removed int64
}

// WriteJobChange writes and removes jobs in one planner as one transaction; when any job has moved
// it touches none and names every job in the change that has.
func (m *Mongo) WriteJobChange(ctx context.Context, owner models.Owner, accountID string, change JobChange, now time.Time, sessionID, wsClientID string) (JobChangeResult, []string, []RevisionConflict, error) {
	if m == nil {
		return JobChangeResult{}, nil, nil, fmt.Errorf("WriteJobChange: invalid arguments")
	}
	d := m.JobDocuments
	if _, err := d.requireColl(); err != nil || accountID == "" || owner.IsZero() {
		return JobChangeResult{}, nil, nil, fmt.Errorf("WriteJobChange: invalid arguments")
	}

	writes, failed := planJobDocumentWrites(owner, accountID, change.Whole, now, sessionID, wsClientID)
	fieldWrites, fieldFailed := planJobFieldWrites(owner, accountID, change.Fields, now, sessionID, wsClientID)
	deletes, deleteFailed := planJobDeletes(change.Deletes)
	failed = slices.Concat(failed, fieldFailed, deleteFailed)
	if len(failed) > 0 {
		return JobChangeResult{}, failed, nil, nil
	}
	writes = slices.Concat(writes, fieldWrites)

	conflicts, err := m.inJobChange(ctx, owner, func(txCtx context.Context) error {
		if err := d.writeAllInChange(txCtx, owner, writes); err != nil {
			return err
		}
		return d.removeAllInChange(txCtx, owner, deletes, now, sessionID, wsClientID)
	}, slices.Concat(writes, deletes))
	if err != nil || len(conflicts) > 0 {
		return JobChangeResult{}, nil, conflicts, err
	}
	return JobChangeResult{Written: int64(len(writes)), Removed: int64(len(deletes))}, nil, nil, nil
}

// inJobChange runs a change in one transaction and, when part of it no longer applied, names every
// planned job that has moved; a refusal that finds none moved is an error, never a landed change.
func (m *Mongo) inJobChange(ctx context.Context, owner models.Owner, steps func(context.Context) error, planned []conditionalJobWrite) ([]RevisionConflict, error) {
	err := m.InTransaction(ctx, steps)
	if !errors.Is(err, errChangeStale) {
		return nil, err
	}
	conflicts, err := m.JobDocuments.staleInChange(ctx, owner, planned)
	if err == nil && len(conflicts) == 0 {
		return nil, fmt.Errorf("a change was refused but no job in it has moved")
	}
	return conflicts, err
}

// planJobDeletes turns each removal into the revision it must still be at, and names the removals
// that carry no job or no revision.
func planJobDeletes(removals []models.JobDeleteBody) ([]conditionalJobWrite, []string) {
	planned := make([]conditionalJobWrite, 0, len(removals))
	var failed []string
	for _, remove := range removals {
		if remove.Validate() != nil {
			failed = append(failed, remove.JobID)
			continue
		}
		planned = append(planned, conditionalJobWrite{jobID: remove.JobID, expected: remove.Revision})
	}
	return planned, failed
}

// writeAllInChange makes every write of a change in one ordered bulk write, refusing the change unless
// each applied: a job read at a revision must still be at it, and a new job must not already exist.
func (d *Docs) writeAllInChange(ctx context.Context, owner models.Owner, writes []conditionalJobWrite) error {
	if len(writes) == 0 {
		return nil
	}
	ops := make([]mongo.WriteModel, 0, len(writes))
	for _, write := range writes {
		if write.expected > 0 {
			ops = append(ops, mongo.NewUpdateOneModel().SetFilter(conditionalJobFilter(owner, write)).SetUpdate(write.update))
			continue
		}
		ops = append(ops, mongo.NewUpdateOneModel().SetFilter(bson.M{
			"_id":             OwnerScopedDocumentID(owner, write.jobID),
			FieldMetaRevision: bson.M{"$exists": false},
		}).SetUpdate(write.update).SetUpsert(true))
	}
	res, err := RetryValue(ctx, "WriteJobsInChange", func() (*mongo.BulkWriteResult, error) {
		return d.coll.BulkWrite(ctx, ops, options.BulkWrite().SetOrdered(true))
	})
	if mongo.IsDuplicateKeyError(err) {
		return errChangeStale
	}
	if err != nil {
		return fmt.Errorf("write the change: %w", err)
	}
	if res.MatchedCount+res.UpsertedCount != int64(len(writes)) {
		return errChangeStale
	}
	return nil
}

// removeAllInChange stamps and removes every job a change removes, refusing the change unless each was
// still at the revision the change read it at.
func (d *Docs) removeAllInChange(ctx context.Context, owner models.Owner, removals []conditionalJobWrite, now time.Time, sessionID, wsClientID string) error {
	if len(removals) == 0 {
		return nil
	}
	match := make(bson.A, 0, len(removals))
	for _, remove := range removals {
		match = append(match, conditionalJobFilter(owner, remove))
	}
	removed, err := d.deleteManyAfterStampingMeta(ctx, bson.M{"$or": match}, now, sessionID, wsClientID, "RemoveJobsInChange")
	if err != nil {
		return fmt.Errorf("remove the change's jobs: %w", err)
	}
	if removed != int64(len(removals)) {
		return errChangeStale
	}
	return nil
}

// staleInChange reads where every job in a refused change now stands and names those it no longer
// applies to.
func (d *Docs) staleInChange(ctx context.Context, owner models.Owner, writes []conditionalJobWrite) ([]RevisionConflict, error) {
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
		if !moved {
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
