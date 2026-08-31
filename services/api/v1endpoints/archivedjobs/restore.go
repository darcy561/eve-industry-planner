package archivedjobs

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/jobidentity"
	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type restoreRequest struct {
	Archive    archiveScope
	SessionID  string
	WSClientID string
	Jobs       []models.Job
}

type restoreResult struct {
	RestoredJobIDs []string
	// Jobs are the documents as written, so the client that asked can apply them
	// without a second read. The realtime broadcast excludes its own originator.
	Jobs      []models.Job
	Conflicts []esiConflict
	// Groups are the containers the restored jobs rejoined, one per group they
	// were archived from.
	Groups []models.Group
}

// restoreJobs returns archived jobs to the planner: decrypt, resolve ESI links,
// write job documents, re-link, return them to their groups, delete from the
// archive, then queue the statistics rebuild. The write-before-delete order is
// deliberate.
func restoreJobs(ctx context.Context, h *Handlers, req restoreRequest) (restoreResult, error) {
	if len(req.Jobs) == 0 {
		return restoreResult{}, nil
	}
	if h.EntityCipher == nil {
		return restoreResult{}, fmt.Errorf("entity ref helper is not configured")
	}

	now := time.Now().UTC()
	var err error
	jobIDs := make([]string, 0, len(req.Jobs))
	for i := range req.Jobs {
		jobIDs = append(jobIDs, req.Jobs[i].JobID)
	}

	// The archive holds refs; the planner reads raw ids.
	links := esiLinkSet{}
	for i := range req.Jobs {
		job := &req.Jobs[i]
		if decErr := jobidentity.Decrypt(job, h.EntityCipher); decErr != nil {
			return restoreResult{}, fmt.Errorf("convert entity refs for %s: %w", job.JobID, decErr)
		}
		links = links.merge(esiLinksOf(job))
	}

	var free esiLinkSet
	var conflicts []esiConflict
	if req.Archive.relinksESI {
		free, conflicts, err = resolveESILinks(ctx, h.Mongo, req.Archive.OwnerID, links, jobIDs)
		if err != nil {
			return restoreResult{}, fmt.Errorf("resolve esi links: %w", err)
		}
	}

	// A job keeps only the ids it reclaimed.
	conflicted := conflictIndex(conflicts)
	for i := range req.Jobs {
		stripConflictedLinks(&req.Jobs[i], conflicted)
		req.Jobs[i].MetaData.ArchivedAt = time.Time{}
		req.Jobs[i].MetaData.ArchivedBy = ""
		req.Jobs[i].MetaData.ArchiveProcessed = false
	}

	if _, failed, writeErr := h.Mongo.JobDocuments.BulkUpsertJobs(ctx, req.Archive.OwnerID, req.Jobs, now, req.SessionID, req.WSClientID); writeErr != nil {
		return restoreResult{}, fmt.Errorf("write job documents: %w", writeErr)
	} else if failed > 0 {
		return restoreResult{}, fmt.Errorf("write job documents: %d of %d rejected", failed, len(req.Jobs))
	}

	if req.Archive.relinksESI {
		if linkErr := applyESILinks(ctx, h.Mongo, req.Archive.OwnerID, free, now, req.SessionID, req.WSClientID); linkErr != nil {
			return restoreResult{}, fmt.Errorf("relink esi ids: %w", linkErr)
		}
	}

	groups, groupErr := restoreGroups(ctx, h.Mongo, req.Archive.OwnerID, req.Jobs, now, req.SessionID, req.WSClientID)
	if groupErr != nil {
		return restoreResult{}, fmt.Errorf("write group: %w", groupErr)
	}

	if delErr := deleteArchivedJobs(ctx, req.Archive, jobIDs, now, req.SessionID, req.WSClientID); delErr != nil {
		return restoreResult{}, fmt.Errorf("remove archived documents: %w", delErr)
	}

	// The restored jobs' figures are still counted in the owner's aggregates.
	// Revoking their rows records that they should not be, and leaves the stamp
	// that says they still are — which is what the statistics pass looks for to
	// take them back out.
	if _, revokeErr := h.Mongo.RevokeStatsRowsForJobs(ctx, req.Archive.OwnerID, jobIDs, now); revokeErr != nil {
		return restoreResult{}, fmt.Errorf("revoke statistics rows: %w", revokeErr)
	}

	// Queued last: the pass reads the archive and must see the deletion.
	if req.Archive.queueRebuild == nil {
		return restoreResult{}, fmt.Errorf("archive scope has no statistics queue")
	}
	if queueErr := req.Archive.queueRebuild(ctx, h.Mongo, req.Archive.OwnerID, now); queueErr != nil {
		return restoreResult{}, fmt.Errorf("queue statistics work: %w", queueErr)
	}

	return restoreResult{RestoredJobIDs: jobIDs, Jobs: req.Jobs, Conflicts: conflicts, Groups: groups}, nil
}

func conflictIndex(conflicts []esiConflict) map[esiLinkKind]map[int]struct{} {
	out := map[esiLinkKind]map[int]struct{}{}
	for _, c := range conflicts {
		if out[c.Kind] == nil {
			out[c.Kind] = map[int]struct{}{}
		}
		out[c.Kind][c.ID] = struct{}{}
	}
	return out
}

// stripConflictedLinks removes ids another job holds from a restored job.
func stripConflictedLinks(job *models.Job, conflicted map[esiLinkKind]map[int]struct{}) {
	job.APIOrders = keepUnconflicted(job.APIOrders, conflicted[esiLinkOrder])
	job.APIJobs = keepUnconflicted(job.APIJobs, conflicted[esiLinkJob])
	job.APITransactions = keepUnconflicted(job.APITransactions, conflicted[esiLinkTransaction])
}

func keepUnconflicted(ids []int, taken map[int]struct{}) []int {
	if len(taken) == 0 {
		return ids
	}
	out := make([]int, 0, len(ids))
	for _, id := range ids {
		if _, gone := taken[id]; gone {
			continue
		}
		out = append(out, id)
	}
	return out
}

func deleteArchivedJobs(ctx context.Context, scope archiveScope, jobIDs []string, now time.Time, sessionID, wsClientID string) error {
	if scope.jobs == nil {
		return fmt.Errorf("archive collection is required")
	}
	filter := scope.filter()
	filter["jobID"] = bson.M{"$in": jobIDs}
	_, err := scope.jobs.DeleteManyAfterStampingMeta(ctx, filter, now, sessionID, wsClientID)
	return err
}
