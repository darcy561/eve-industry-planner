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
//
// Gone separates the two reasons a conditional filter matches nothing, which a
// caller has to tell apart: the document moved under the writer, or it no longer
// exists. The revision alone cannot say which — a filter naming both the id and
// the revision misses for either reason.
type RevisionConflict struct {
	JobID    string
	Expected int64
	Current  int64
	Gone     bool
}

// conditionalJobWrite is one write held back from the batch because its answer
// has to be read on its own: BulkWrite reports only totals, and an unconditional
// write matching an existing document contributes to them exactly as a
// conditional one that landed does.
type conditionalJobWrite struct {
	jobID    string
	expected int64
	update   bson.M
}

// BulkUpsertJobs upserts job documents into one planner (unordered BulkWrite).
// Intended for mongo.JobDocuments.
//
// owner is the planner the documents belong to; accountID is who wrote them, and
// the two differ whenever a member writes in a planner that is not their own.
//
// A job carrying a revision in its `_meta` is written conditionally: the filter
// names the revision as well as the id, so a document somebody else has written
// since is not overwritten. Such a write is reported in conflicts rather than as
// an error, and the rest of the batch still lands — a batch in which one job
// moved writes the others.
//
// A job carrying no revision is written unconditionally, which is what lets a
// client that does not yet send one keep working.
func (d *Docs) BulkUpsertJobs(ctx context.Context, owner models.Owner, accountID string, jobs []models.Job, now time.Time, sessionID, wsClientID string) (*mongo.BulkWriteResult, int, []RevisionConflict, error) {
	coll, err := d.requireColl()
	if err != nil || accountID == "" || owner.IsZero() {
		return nil, 0, nil, fmt.Errorf("BulkUpsertJobs: invalid arguments")
	}
	bulkOps := make([]mongo.WriteModel, 0, len(jobs))
	conditional := make([]conditionalJobWrite, 0, len(jobs))
	failedCount := 0
	for _, job := range jobs {
		if job.JobID == "" {
			failedCount++
			continue
		}
		expected := job.MetaData.Revision
		job.MetaData.LastModified = now
		job.MetaData.LastUpdatedBy = accountID
		job.MetaData.Owner = owner
		ApplyMetaSessionClient(&job.MetaData.MetaData, sessionID, wsClientID)
		update, uerr := SetDocumentWithRevision(job, JobDocumentsUpsertUnset)
		if uerr != nil {
			failedCount++
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
			return nil, failedCount, nil, err
		}
	}

	conflicts, applied, cerr := d.applyConditionalWrites(ctx, owner, conditional)
	if cerr != nil {
		return result, failedCount, nil, cerr
	}
	if result == nil {
		result = &mongo.BulkWriteResult{}
	}
	result.MatchedCount += applied
	result.ModifiedCount += applied
	if len(bulkOps) == 0 && len(conditional) == 0 {
		return nil, failedCount, nil, nil
	}
	return result, failedCount, conflicts, nil
}

// applyConditionalWrites issues each conditional write on its own and reports the
// ones the document had moved under.
//
// One at a time because the answer is per write: an UpdateOne says whether its
// filter matched, where a batch reports only totals that an unconditional write
// in the same batch also contributes to. Reading the revision back afterwards
// cannot substitute — a refused write and a successful one leave the document at
// the same revision, because in both cases exactly one write landed.
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
//
// No upsert accompanies it: a filter naming a revision the document does not
// carry matches nothing, and an upsert would answer that by writing the document
// the filter just refused to match.
func conditionalJobFilter(owner models.Owner, write conditionalJobWrite) bson.M {
	return bson.M{
		"_id":             OwnerScopedDocumentID(owner, write.jobID),
		FieldMetaRevision: write.expected,
	}
}

// describeConflict reads what the refused write must be reconciled against.
//
// The revision is read only for a write already known to have been refused, so
// what it finds cannot change that answer — it only says what to reconcile
// against, and whether there is anything left to reconcile with.
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
//
// Upsert is on, which is what it has always been: a client that does not say
// which version it read is asking for the document to hold what it sent,
// whether or not one exists. A conditional write takes a different path
// entirely — see [conditionalJobWrite].
func buildJobUnconditionalUpsertModel(owner models.Owner, jobID string, update bson.M) *mongo.UpdateOneModel {
	return mongo.NewUpdateOneModel().
		SetUpdate(update).
		SetUpsert(true).
		SetFilter(bson.M{"_id": OwnerScopedDocumentID(owner, jobID)})
}
