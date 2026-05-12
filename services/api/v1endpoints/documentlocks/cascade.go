package documentlocks

import (
	"context"
	"errors"

	mongocore "eve-industry-planner/shared/core/mongo"
	mongoget "eve-industry-planner/shared/core/mongo/get"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"

	"go.mongodb.org/mongo-driver/mongo"
)

// LockReleaseReasonGroupHandoffCascade tags `document_lock_released` events produced by
// the group handoff cascade so clients can distinguish them from voluntary releases
// (and skip the usual auto-reacquire path on the previous holder).
const LockReleaseReasonGroupHandoffCascade = "group_handoff_cascade"

// releaseDependentJobLocksOnGroupHandoff force-releases per-job locks for jobs in the
// just-handed-off group that were still held by the previous group lock holder.
//
// The group lock (`user_job_groups`) and per-job locks (`user_job_documents`) live in
// independent Redis rows, so a group handoff on its own leaves the old holder's
// per-job leases in place — that's why job cards on the new holder's group page stay
// "Locked" after the swap. We evict those orphaned job locks here so the cards reflect
// the new holder immediately, and publish per-job `document_lock_released` events
// tagged with reason `group_handoff_cascade` so the previous holder's per-job
// `useDocumentLock` does not race to grab them back.
//
// Failures are logged but never unwind the parent handoff; in the worst case the
// affected scopes will reconcile on the next `useJobPlannerJobLockSync` status sweep
// (or `useDocumentLock`'s 45s server sync) instead of immediately.
func releaseDependentJobLocksOnGroupHandoff(
	ctx context.Context,
	clients *shared.ServiceClients,
	accountID, groupID, oldHolderSessionID string,
) {
	cascadeReleaseDependentJobLocks(
		ctx, clients, accountID, groupID,
		func(rec *lockRecord) (bool, string) {
			return decideHandoffCascadeRelease(rec, oldHolderSessionID)
		},
	)
}

// decideHandoffCascadeRelease is the predicate that
// `releaseDependentJobLocksOnGroupHandoff` applies per per-job lock: release
// only the entries whose holder matches the old group holder, attributing the
// emitted `document_lock_released` event to that same session.
//
// Extracted as a named function purely so the predicate is unit-testable
// without spinning up Mongo + Redis; behaviour is unchanged.
func decideHandoffCascadeRelease(rec *lockRecord, oldHolderSessionID string) (release bool, attribTo string) {
	if rec == nil || rec.HolderSessionID != oldHolderSessionID {
		return false, ""
	}
	return true, oldHolderSessionID
}

// ReleaseStaleDependentJobLocksAfterGroupGrant force-releases per-job locks in the group
// whose holder is anyone other than `newGroupHolderSessionID`. Used when the group lock
// has just been granted to `newGroupHolderSessionID` via a code path that doesn't know
// the previous holder's id (TTL-driven waitlist promotion in `expiry_subscriber.go`, or
// auto-grant inside `/request` when an orphaned group is taken over).
//
// By design, per-job locks for jobs inside a group are only acquired by sessions that
// also hold the parent group lock (`useEditJobDocumentLocks`), so once the group lock
// has rotated, any per-job lock pointing at a different session is stale and would
// otherwise linger until its own TTL fires — leaving the new group holder's cards
// "Locked" for up to a full lease duration.
func ReleaseStaleDependentJobLocksAfterGroupGrant(
	ctx context.Context,
	clients *shared.ServiceClients,
	accountID, groupID, newGroupHolderSessionID string,
) {
	if newGroupHolderSessionID == "" {
		return
	}
	cascadeReleaseDependentJobLocks(
		ctx, clients, accountID, groupID,
		func(rec *lockRecord) (bool, string) {
			return decideStaleAfterGrantRelease(rec, newGroupHolderSessionID)
		},
	)
}

// decideStaleAfterGrantRelease is the predicate
// `ReleaseStaleDependentJobLocksAfterGroupGrant` applies per per-job lock:
// release any entry whose holder differs from the new group lock holder,
// attributing the event to whichever stale session was evicted.
//
// Extracted from the inline closure to make the freshness rule directly
// unit-testable; behaviour is unchanged.
func decideStaleAfterGrantRelease(rec *lockRecord, newGroupHolderSessionID string) (release bool, attribTo string) {
	if rec == nil || rec.HolderSessionID == "" {
		return false, ""
	}
	if rec.HolderSessionID == newGroupHolderSessionID {
		return false, ""
	}
	return true, rec.HolderSessionID
}

// cascadeReleaseDependentJobLocks is the shared body for both cascade helpers.
// `decide` returns whether the job lock should be released and, if so, which session id
// to attribute the published `document_lock_released` event to (so client handlers can
// log/diagnose which session was evicted).
func cascadeReleaseDependentJobLocks(
	ctx context.Context,
	clients *shared.ServiceClients,
	accountID, groupID string,
	decide func(*lockRecord) (bool, string),
) {
	if clients == nil || clients.Mongo == nil || clients.Redis == nil {
		return
	}
	if accountID == "" || groupID == "" {
		return
	}

	groupColl := clients.Mongo.
		Database(mongocore.DatabaseName).
		Collection(mongocore.CollectionUserJobGroups)
	group, err := mongoget.LoadGroupByID(ctx, groupColl, accountID, groupID)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return
		}
		logs.WarnCtx(ctx, "doc lock cascade: load group failed",
			"error", err,
			"account_id", accountID,
			"group_id", groupID)
		return
	}

	for _, jobID := range group.IncludedJobIDs {
		if jobID == "" {
			continue
		}
		rec, err := getLock(ctx, clients.Redis, accountID, mongocore.CollectionUserJobDocuments, jobID)
		if err != nil {
			logs.WarnCtx(ctx, "doc lock cascade: get job lock failed",
				"error", err,
				"account_id", accountID,
				"group_id", groupID,
				"job_id", jobID)
			continue
		}
		release, evictedSessionID := decide(rec)
		if !release {
			continue
		}
		if err := deleteLock(ctx, clients.Redis, accountID, mongocore.CollectionUserJobDocuments, jobID); err != nil {
			logs.WarnCtx(ctx, "doc lock cascade: delete job lock failed",
				"error", err,
				"account_id", accountID,
				"group_id", groupID,
				"job_id", jobID)
			continue
		}
		_ = publishLockEvent(ctx, clients, accountID, map[string]any{
			"type":                LockEventReleased,
			"collection":          mongocore.CollectionUserJobDocuments,
			"docID":               jobID,
			"sessionID":           evictedSessionID,
			"reason":              LockReleaseReasonGroupHandoffCascade,
			"cascadedFromGroupID": groupID,
		})
	}
}
