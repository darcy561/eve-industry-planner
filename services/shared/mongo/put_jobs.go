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

// conditionalJobWrite is one write held back from the batch because its answer has
// to be read on its own rather than in BulkWrite's totals.
type conditionalJobWrite struct {
	jobID    string
	expected int64
	update   bson.M
}

// BulkUpsertJobs upserts job documents into one planner (unordered BulkWrite).
// Intended for mongo.JobDocuments.
func (d *Docs) BulkUpsertJobs(ctx context.Context, owner models.Owner, accountID string, jobs []models.Job, now time.Time, sessionID, wsClientID string) (*mongo.BulkWriteResult, []string, []RevisionConflict, error) {
	coll, err := d.requireColl()
	if err != nil || accountID == "" || owner.IsZero() {
		return nil, nil, nil, fmt.Errorf("BulkUpsertJobs: invalid arguments")
	}
	bulkOps := make([]mongo.WriteModel, 0, len(jobs))
	conditional := make([]conditionalJobWrite, 0, len(jobs))
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
		update, uerr := SetDocumentWithRevision(job, JobDocumentsUpsertUnset)
		if uerr != nil {
			failed = append(failed, job.JobID)
			continue
		}
		if expected > 0 {
			conditional = append(conditional, conditionalJobWrite{job.JobID, expected, update})
			continue
		}
		bulkOps = append(bulkOps, buildJobUnconditionalUpsertModel(owner, job.JobID, update))
	}

	var result *mongo.BulkWriteResult
	if len(bulkOps) > 0 {
		err = Retry(ctx, "BulkUpsertJobs", func() error {
			var opErr error
			result, opErr = coll.BulkWrite(ctx, bulkOps, options.BulkWrite().SetOrdered(false))
			return opErr
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
		var res *mongo.UpdateResult
		if err := Retry(ctx, "ConditionalUpsertJob", func() error {
			var opErr error
			res, opErr = coll.UpdateOne(ctx, conditionalJobFilter(owner, write), write.update)
			return opErr
		}); err != nil {
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
	coll, err := d.requireColl()
	if err != nil {
		return conflict
	}
	var row struct {
		Meta struct {
			Revision int64 `bson:"revision"`
		} `bson:"_meta"`
	}
	err = coll.FindOne(ctx,
		bson.M{"_id": OwnerScopedDocumentID(owner, jobID)},
		options.FindOne().SetProjection(bson.M{FieldMetaRevision: 1}),
	).Decode(&row)
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
