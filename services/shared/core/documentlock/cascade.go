package documentlock

import (
	"context"
	"errors"

	mongocore "eve-industry-planner/shared/core/mongo"
	mongoget "eve-industry-planner/shared/core/mongo/get"
	"eve-industry-planner/shared/logs"

	"go.mongodb.org/mongo-driver/mongo"
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
	)
}

func cascadeReleaseDependentJobLocks(
	ctx context.Context,
	d Deps,
	accountID, groupID string,
	decide func(*LockRecord) (bool, string),
) {
	if d.Mongo == nil || d.Redis == nil {
		return
	}
	if accountID == "" || groupID == "" {
		return
	}

	groupColl := d.Mongo.
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
		rec, err := GetLock(ctx, d.Redis, accountID, mongocore.CollectionUserJobDocuments, jobID)
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
		if err := DeleteLock(ctx, d.Redis, accountID, mongocore.CollectionUserJobDocuments, jobID); err != nil {
			logs.WarnCtx(ctx, "doc lock cascade: delete job lock failed",
				"error", err,
				"account_id", accountID,
				"group_id", groupID,
				"job_id", jobID)
			continue
		}
		_ = PublishLockEvent(ctx, d.JetStream, accountID, map[string]any{
			LockPayloadEventKey: LockEventReleased,
			"collection":         mongocore.CollectionUserJobDocuments,
			"docID":               jobID,
			"sessionID":           evictedSessionID,
			"reason":              LockReleaseReasonGroupHandoffCascade,
			"cascadedFromGroupID": groupID,
		})
	}
}
