package documentlock

import (
	"context"
	"errors"

	"eve-industry-planner/shared/logs"
	eipmongo "eve-industry-planner/shared/mongo"

	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

// DecideHandoffCascadeRelease is the predicate for group handoff cascade (exported for unit tests).
func DecideHandoffCascadeRelease(rec *LockRecord, oldHolderSessionID string) (release bool, attribTo string) {
	if rec == nil || rec.HolderSessionID != oldHolderSessionID {
		return false, ""
	}
	return true, oldHolderSessionID
}

// DecideStaleAfterGrantRelease is the predicate for stale cleanup after a new group holder (exported for unit tests).
func DecideStaleAfterGrantRelease(rec *LockRecord, newGroupHolderSessionID string) (release bool, attribTo string) {
	if rec == nil || rec.HolderSessionID == "" {
		return false, ""
	}
	if rec.HolderSessionID == newGroupHolderSessionID {
		return false, ""
	}
	return true, rec.HolderSessionID
}

// ReleaseDependentJobLocksOnGroupHandoff force-releases per-job locks still held by the previous group holder.
func ReleaseDependentJobLocksOnGroupHandoff(
	ctx context.Context,
	d Deps,
	accountID, groupID, oldHolderSessionID string,
) {
	cascadeReleaseDependentJobLocks(
		ctx, d, accountID, groupID,
		func(rec *LockRecord) (bool, string) {
			return DecideHandoffCascadeRelease(rec, oldHolderSessionID)
		},
		LockReleaseReasonGroupHandoffCascade,
	)
}

// ReleaseStaleDependentJobLocksAfterGroupGrant force-releases per-job locks not aligned to the new group holder.
func ReleaseStaleDependentJobLocksAfterGroupGrant(
	ctx context.Context,
	d Deps,
	accountID, groupID, newGroupHolderSessionID string,
) {
	if newGroupHolderSessionID == "" {
		return
	}
	cascadeReleaseDependentJobLocks(
		ctx, d, accountID, groupID,
		func(rec *LockRecord) (bool, string) {
			return DecideStaleAfterGrantRelease(rec, newGroupHolderSessionID)
		},
		LockReleaseReasonGroupHandoffCascade,
	)
}

// ReleaseStaleDependentJobLocksOnGroupMembershipAdded evicts per-job locks on
// newly added group members that are not held by groupHolderSessionID (interpretation A).
// Does not load Mongo membership — caller passes explicit addedJobIDs from the group write.
// Caller should ensure the requester holds the group lock before invoking.
func ReleaseStaleDependentJobLocksOnGroupMembershipAdded(
	ctx context.Context,
	d Deps,
	accountID, groupID string,
	addedJobIDs []string,
	groupHolderSessionID string,
) {
	if d.Redis == nil {
		return
	}
	if accountID == "" || groupID == "" || groupHolderSessionID == "" || len(addedJobIDs) == 0 {
		return
	}

	releases, err := pipelinedDecideAndReleaseJobLocks(ctx, d.Redis, accountID, addedJobIDs,
		func(rec *LockRecord) (bool, string) {
			return DecideStaleAfterGrantRelease(rec, groupHolderSessionID)
		})
	if err != nil {
		logs.WarnCtx(ctx, "doc lock cascade: membership redis pipeline failed",
			"error", err,
			"account_id", accountID,
			"group_id", groupID,
			"added_jobs", len(addedJobIDs))
		if len(releases) == 0 {
			return
		}
	}
	if len(releases) == 0 {
		return
	}
	if d.NATS == nil {
		return
	}
	_ = PublishLockEvent(ctx, d.NATS, accountID, BuildGroupCascadePayload(
		eipmongo.CollectionAccountJobGroups,
		groupID,
		eipmongo.CollectionAccountJobDocuments,
		releases,
		LockReleaseReasonGroupMembershipAdded,
	))
}

func cascadeReleaseDependentJobLocks(
	ctx context.Context,
	d Deps,
	accountID, groupID string,
	decide func(*LockRecord) (bool, string),
	cascadeReason string,
) {
	if d.Mongo == nil || d.Redis == nil || d.NATS == nil {
		return
	}
	if accountID == "" || groupID == "" {
		return
	}

	group, err := d.Mongo.Groups.LoadGroupByID(ctx, accountID, groupID)
	if err != nil {
		if errors.Is(err, mongodriver.ErrNoDocuments) {
			return
		}
		logs.WarnCtx(ctx, "doc lock cascade: load group failed",
			"error", err,
			"account_id", accountID,
			"group_id", groupID)
		return
	}

	// The pipelined helper does the GET-all → decide → DEL-chosen flow in
	// two Redis round-trips regardless of how many jobs the group has.
	// JetStream publishing stays here so partial DEL failures don't
	// silently swallow events.
	releases, err := pipelinedDecideAndReleaseJobLocks(ctx, d.Redis, accountID, group.IncludedJobIDs, decide)
	if err != nil {
		logs.WarnCtx(ctx, "doc lock cascade: redis pipeline failed",
			"error", err,
			"account_id", accountID,
			"group_id", groupID,
			"job_count", len(group.IncludedJobIDs))
		if len(releases) == 0 {
			return
		}
	}

	// One batched `document_lock_group_cascade` event carries every
	// release; the frontend (`useLockScopeSync.js`) applies all N scope
	// patches in a single store transaction. See BuildGroupCascadePayload.
	if len(releases) == 0 {
		return
	}
	_ = PublishLockEvent(ctx, d.NATS, accountID, BuildGroupCascadePayload(
		eipmongo.CollectionAccountJobGroups,
		groupID,
		eipmongo.CollectionAccountJobDocuments,
		releases,
		cascadeReason,
	))
}
