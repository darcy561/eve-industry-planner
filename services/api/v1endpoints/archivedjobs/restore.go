package archivedjobs

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"eve-industry-planner/shared/jobidentity"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type restoreRequest struct {
	Archive archiveScope
	// AccountID is who asked, which on a shared planner is not the archive's
	// owner.
	AccountID  string
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

// restoreJobs returns archived jobs to the planner, writing each job document
// before deleting it from the archive.
func restoreJobs(ctx context.Context, h *Handlers, req restoreRequest) (restoreResult, error) {
	if len(req.Jobs) == 0 {
		return restoreResult{}, nil
	}
	if h.EntityCipher == nil {
		return restoreResult{}, fmt.Errorf("entity ref helper is not configured")
	}
	if req.AccountID == "" || req.Archive.Owner.IsZero() {
		return restoreResult{}, fmt.Errorf("restoreJobs: an account and an archive owner are required")
	}

	now := time.Now().UTC()
	var err error
	jobIDs := make([]string, 0, len(req.Jobs))
	for i := range req.Jobs {
		jobIDs = append(jobIDs, req.Jobs[i].JobID)
	}

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
		free, conflicts, err = resolveESILinks(ctx, h.Mongo, req.AccountID, links, jobIDs)
		if err != nil {
			return restoreResult{}, fmt.Errorf("resolve esi links: %w", err)
		}
	}

	conflicted := conflictIndex(conflicts)
	for i := range req.Jobs {
		stripConflictedLinks(&req.Jobs[i], conflicted)
		req.Jobs[i].MetaData.ArchivedAt = time.Time{}
		req.Jobs[i].MetaData.ArchivedBy = ""
		req.Jobs[i].MetaData.ArchiveProcessed = false
	}

	if _, failed, _, writeErr := h.Mongo.JobDocuments.BulkUpsertJobs(ctx, req.Archive.Owner, req.AccountID, req.Jobs, now, req.SessionID, req.WSClientID); writeErr != nil {
		return restoreResult{}, fmt.Errorf("write job documents: %w", writeErr)
	} else if len(failed) > 0 {
		return restoreResult{}, fmt.Errorf("write job documents: %d of %d rejected", len(failed), len(req.Jobs))
	}

	if req.Archive.relinksESI {
		if linkErr := applyESILinks(ctx, h.Mongo, req.AccountID, free, now, req.SessionID, req.WSClientID); linkErr != nil {
			return restoreResult{}, fmt.Errorf("relink esi ids: %w", linkErr)
		}
	}

	groups, groupErr := restoreGroups(ctx, h.Mongo, req.Archive.Owner, req.AccountID, req.Jobs, now, req.SessionID, req.WSClientID)
	if groupErr != nil {
		return restoreResult{}, fmt.Errorf("write group: %w", groupErr)
	}

	if delErr := deleteArchivedJobs(ctx, req.Archive, jobIDs, now, req.SessionID, req.WSClientID); delErr != nil {
		return restoreResult{}, fmt.Errorf("remove archived documents: %w", delErr)
	}

	if _, revokeErr := h.Mongo.RevokeStatsRowsForJobs(ctx, req.Archive.Owner, jobIDs, now); revokeErr != nil {
		return restoreResult{}, fmt.Errorf("revoke statistics rows: %w", revokeErr)
	}

	if queueErr := req.Archive.queueRebuild(ctx, h.Mongo, now); queueErr != nil {
		return restoreResult{}, fmt.Errorf("queue statistics work: %w", queueErr)
	}

	return restoreResult{RestoredJobIDs: jobIDs, Jobs: req.Jobs, Conflicts: conflicts, Groups: groups}, nil
}

func conflictIndex(conflicts []esiConflict) map[esiLinkKind]map[int64]struct{} {
	out := map[esiLinkKind]map[int64]struct{}{}
	for _, c := range conflicts {
		if out[c.Kind] == nil {
			out[c.Kind] = map[int64]struct{}{}
		}
		out[c.Kind][c.ID] = struct{}{}
	}
	return out
}

// stripConflictedLinks removes what another job holds from a restored job. A job
// holds an ESI id by carrying its row, so the row itself goes.
func stripConflictedLinks(job *models.Job, conflicted map[esiLinkKind]map[int64]struct{}) {
	for id := range conflicted[esiLinkOrder] {
		delete(job.ESI.MarketOrders, strconv.FormatInt(id, 10))
	}
	for id := range conflicted[esiLinkJob] {
		delete(job.ESI.LinkedJobs, strconv.FormatInt(id, 10))
	}
	for id := range conflicted[esiLinkTransaction] {
		delete(job.ESI.Transactions, strconv.FormatInt(id, 10))
	}
}

func taken(ids map[int64]struct{}, id int64) bool {
	_, held := ids[id]
	return held
}

func deleteArchivedJobs(ctx context.Context, scope archiveScope, jobIDs []string, now time.Time, sessionID, wsClientID string) error {
	if scope.jobs == nil {
		return fmt.Errorf("archive collection is required")
	}
	filter := bson.M{"_id": bson.M{"$in": eipmongo.OwnerScopedDocumentIDs(scope.Owner, jobIDs)}}
	_, err := scope.jobs.DeleteManyAfterStampingMeta(ctx, filter, now, sessionID, wsClientID)
	return err
}
