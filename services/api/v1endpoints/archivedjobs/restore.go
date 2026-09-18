package archivedjobs

import (
	"context"
	"fmt"
	"slices"
	"time"

	"eve-industry-planner/shared/jobidentity"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type restoreRequest struct {
	Archive archiveScope
	// AccountID is who asked. It is not the archive's owner on a shared planner,
	// and the ESI ids a restore reclaims are the account's rather than the
	// planner's.
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
	// Named rather than left to the write to reject: the account and the archive's
	// owner differ on a shared planner, so an unset one is a real mistake here.
	if req.AccountID == "" || req.Archive.Owner.IsZero() {
		return restoreResult{}, fmt.Errorf("restoreJobs: an account and an archive owner are required")
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
		free, conflicts, err = resolveESILinks(ctx, h.Mongo, req.AccountID, links, jobIDs)
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

	// A restored job is rebuilt from the archive rather than edited, so it carries
	// no revision and is written unconditionally — there is no read for a
	// conditional write to be conditional on.
	if _, failed, _, writeErr := h.Mongo.JobDocuments.BulkUpsertJobs(ctx, req.Archive.Owner, req.AccountID, req.Jobs, now, req.SessionID, req.WSClientID); writeErr != nil {
		return restoreResult{}, fmt.Errorf("write job documents: %w", writeErr)
	} else if failed > 0 {
		return restoreResult{}, fmt.Errorf("write job documents: %d of %d rejected", failed, len(req.Jobs))
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

	// The restored jobs' figures are still counted in the owner's aggregates.
	// Revoking their rows records that they should not be, and leaves the stamp
	// that says they still are — which is what the statistics pass looks for to
	// take them back out.
	if _, revokeErr := h.Mongo.RevokeStatsRowsForJobs(ctx, req.Archive.Owner, jobIDs, now); revokeErr != nil {
		return restoreResult{}, fmt.Errorf("revoke statistics rows: %w", revokeErr)
	}

	// Queued last: the pass reads the archive and must see the deletion.
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
	if orders := conflicted[esiLinkOrder]; len(orders) > 0 {
		job.Build.Sale.MarketOrders = slices.DeleteFunc(job.Build.Sale.MarketOrders,
			func(order models.MarketOrder) bool { return taken(orders, int64(order.OrderID)) })
	}
	if jobs := conflicted[esiLinkJob]; len(jobs) > 0 {
		job.Build.Costs.LinkedJobs = slices.DeleteFunc(job.Build.Costs.LinkedJobs,
			func(linked models.LinkedESIJob) bool { return taken(jobs, int64(linked.JobID)) })
	}
	if transactions := conflicted[esiLinkTransaction]; len(transactions) > 0 {
		job.Build.Sale.Transactions = slices.DeleteFunc(job.Build.Sale.Transactions,
			func(transaction models.Transaction) bool { return taken(transactions, transaction.TransactionID) })
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
