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

// ArchiveJobs moves jobs off the planner into the archive as one transaction, each live job removed
// at the revision its _meta carries; when any has moved it writes none and names every job that has.
func (m *Mongo) ArchiveJobs(ctx context.Context, owner models.Owner, jobs []models.Job, now time.Time, sessionID, wsClientID string) ([]string, []RevisionConflict, error) {
	if m == nil || owner.IsZero() {
		return nil, nil, fmt.Errorf("ArchiveJobs: invalid arguments")
	}
	live := m.JobDocuments
	if _, err := live.requireColl(); err != nil {
		return nil, nil, fmt.Errorf("ArchiveJobs: %w", err)
	}
	archive, err := m.ArchivedJobs.requireColl()
	if err != nil {
		return nil, nil, fmt.Errorf("ArchiveJobs: %w", err)
	}

	copies := make([]mongo.WriteModel, 0, len(jobs))
	removals := make([]models.JobDeleteBody, 0, len(jobs))
	for i := range jobs {
		update, err := SetDocumentWithRevision(&jobs[i], jobRootKeysToClear)
		if err != nil {
			return nil, nil, fmt.Errorf("archive %s: %w", jobs[i].JobID, err)
		}
		copies = append(copies, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": OwnerScopedDocumentID(owner, jobs[i].JobID)}).
			SetUpdate(update).
			SetUpsert(true))
		removals = append(removals, models.JobDeleteBody{JobID: jobs[i].JobID, Revision: jobs[i].MetaData.Revision})
	}
	deletes, failed := planJobDeletes(removals)
	if len(failed) > 0 {
		return failed, nil, nil
	}

	conflicts, err := m.inJobChange(ctx, owner, func(txCtx context.Context) error {
		if len(copies) > 0 {
			if _, err := RetryValue(txCtx, "ArchiveJobsInChange", func() (*mongo.BulkWriteResult, error) {
				return archive.BulkWrite(txCtx, copies, options.BulkWrite().SetOrdered(true))
			}); err != nil {
				return fmt.Errorf("archive the jobs: %w", err)
			}
		}
		return live.removeAllInChange(txCtx, owner, deletes, now, sessionID, wsClientID)
	}, deletes)
	return nil, conflicts, err
}
