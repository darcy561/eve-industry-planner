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

// RevisionConflict is one document a conditional write did not apply to.
type RevisionConflict struct {
	JobID    string
	Expected int64
	Current  int64
	Gone     bool
}

// jobRootKeysToClear are root-level keys the job model does not hold, unset on every upsert of a
// live or archived job.
var jobRootKeysToClear = bson.M{
	"accountID":        "",
	"archiveProcessed": "",
	"archived":         "",
	"archiveTimeStamp": "",
	"deleted":          "",
	"deletedTimeStamp": "",
}

// conditionalJobWrite is one job a write or removal is checked against: the revision it must still
// be at, or none for a job being created.
type conditionalJobWrite struct {
	jobID    string
	expected int64
	update   bson.M
}

// planJobDocumentWrites turns each whole job into the update it makes, carrying the revision it was
// read at, and names the jobs it could not.
func planJobDocumentWrites(owner models.Owner, accountID string, jobs []models.Job, now time.Time, sessionID, wsClientID string) ([]conditionalJobWrite, []string) {
	planned := make([]conditionalJobWrite, 0, len(jobs))
	var failed []string
	for _, job := range jobs {
		if job.JobID == "" {
			failed = append(failed, job.JobID)
			continue
		}
		expected := job.MetaData.Revision
		job.MetaData.LastModified = now
		job.MetaData.LastUpdatedBy = accountID
		job.MetaData.Owner = owner
		ApplyMetaSessionClient(&job.MetaData.MetaData, sessionID, wsClientID)
		update, err := SetDocumentWithRevision(job, jobRootKeysToClear)
		if err != nil {
			failed = append(failed, job.JobID)
			continue
		}
		planned = append(planned, conditionalJobWrite{job.JobID, expected, update})
	}
	return planned, failed
}

// BulkUpsertJobs upserts job documents into one planner (unordered BulkWrite).
// Intended for mongo.JobDocuments.
func (d *Docs) BulkUpsertJobs(ctx context.Context, owner models.Owner, accountID string, jobs []models.Job, now time.Time, sessionID, wsClientID string) (*mongo.BulkWriteResult, []string, []RevisionConflict, error) {
	coll, err := d.requireColl()
	if err != nil || accountID == "" || owner.IsZero() {
		return nil, nil, nil, fmt.Errorf("BulkUpsertJobs: invalid arguments")
	}
	planned, failed := planJobDocumentWrites(owner, accountID, jobs, now, sessionID, wsClientID)
	bulkOps := make([]mongo.WriteModel, 0, len(planned))
	conditional := make([]conditionalJobWrite, 0, len(planned))
	for _, write := range planned {
		if write.expected > 0 {
			conditional = append(conditional, write)
			continue
		}
		bulkOps = append(bulkOps, buildJobUnconditionalUpsertModel(owner, write.jobID, write.update))
	}

	var result *mongo.BulkWriteResult
	if len(bulkOps) > 0 {
		result, err = RetryValue(ctx, "BulkUpsertJobs", func() (*mongo.BulkWriteResult, error) {
			return coll.BulkWrite(ctx, bulkOps, options.BulkWrite().SetOrdered(false))
		})
		if err != nil {
			return nil, failed, nil, err
		}
	}

	conflicts, applied, cerr := d.applyConditionalWrites(ctx, owner, conditional)
	if cerr != nil {
		return result, failed, nil, cerr
	}
	if result == nil {
		result = &mongo.BulkWriteResult{}
	}
	result.MatchedCount += applied
	result.ModifiedCount += applied
	if len(bulkOps) == 0 && len(conditional) == 0 {
		return nil, failed, nil, nil
	}
	return result, failed, conflicts, nil
}

// applyConditionalWrites issues each conditional write on its own and reports the
// ones the document had moved under.
func (d *Docs) applyConditionalWrites(ctx context.Context, owner models.Owner, writes []conditionalJobWrite) ([]RevisionConflict, int64, error) {
	if len(writes) == 0 {
		return nil, 0, nil
	}
	coll, err := d.requireColl()
	if err != nil {
		return nil, 0, err
	}

	var conflicts []RevisionConflict
	var applied int64
	for _, write := range writes {
		res, err := RetryValue(ctx, "ConditionalUpsertJob", func() (*mongo.UpdateResult, error) {
			return coll.UpdateOne(ctx, conditionalJobFilter(owner, write), write.update)
		})
		if err != nil {
			return nil, applied, fmt.Errorf("conditional write %s: %w", write.jobID, err)
		}
		if res.MatchedCount > 0 {
			applied++
			continue
		}
		conflicts = append(conflicts, d.describeConflict(ctx, owner, write.jobID, write.expected))
	}
	return conflicts, applied, nil
}

// conditionalJobFilter names both the document and the revision it was read at,
// which is what stops the write landing on one somebody else has since written.
func conditionalJobFilter(owner models.Owner, write conditionalJobWrite) bson.M {
	return bson.M{
		"_id":             OwnerScopedDocumentID(owner, write.jobID),
		FieldMetaRevision: write.expected,
	}
}

// describeConflict reads what the refused write must be reconciled against.
func (d *Docs) describeConflict(ctx context.Context, owner models.Owner, jobID string, expected int64) RevisionConflict {
	conflict := RevisionConflict{JobID: jobID, Expected: expected, Gone: true}
	row, err := findOne[storedRevisionRow](ctx, d, "describeConflict", bson.M{"_id": OwnerScopedDocumentID(owner, jobID)},
		options.FindOne().SetProjection(bson.M{FieldMetaRevision: 1}))
	if err != nil {
		return conflict
	}
	conflict.Gone = false
	conflict.Current = row.Meta.Revision
	return conflict
}

// buildJobUnconditionalUpsertModel is one job's write when the client sent no
// revision to write against.
func buildJobUnconditionalUpsertModel(owner models.Owner, jobID string, update bson.M) *mongo.UpdateOneModel {
	return mongo.NewUpdateOneModel().
		SetUpdate(update).
		SetUpsert(true).
		SetFilter(bson.M{"_id": OwnerScopedDocumentID(owner, jobID)})
}
