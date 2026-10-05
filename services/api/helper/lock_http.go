package helper

import (
	"errors"
	"net/http"

	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipredis "eve-industry-planner/shared/redis"
)

// GateDocumentLocks names the documents among ids another session holds, answering the request itself
// and reporting false when the check could not be made; with no Redis, nothing is held.
func GateDocumentLocks(w http.ResponseWriter, r *http.Request, metrics *RequestMetricsTracker, rdb *eipredis.Redis, owner models.Owner, collection, endpoint string, ids []string) ([]documentlock.LockHeldElsewhereItem, bool) {
	if rdb == nil {
		return nil, true
	}
	sessionID := AuthenticatedSessionID(r)
	if sessionID == "" {
		metrics.Error("auth_error")
		RespondEndpointError(w, r, http.StatusUnauthorized, "Unauthorized", endpoint+" lock gate: missing session", endpoint+"_missing_session", endpoint, nil, nil)
		return nil, false
	}
	rejects, err := documentlock.CollectLockHeldElsewhereRejects(r.Context(), rdb, owner, sessionID, collection, ids)
	if errors.Is(err, documentlock.ErrSessionRequiredForLockGate) {
		metrics.Error("auth_error")
		RespondEndpointError(w, r, http.StatusUnauthorized, "Unauthorized", endpoint+" lock gate: session required", endpoint+"_session_required", endpoint, err, nil)
		return nil, false
	}
	if err != nil {
		metrics.Error("lock_error")
		RespondEndpointServerError(w, r, "Failed to verify document lock", endpoint+" lock gate failed", endpoint+"_lock_gate_failed", endpoint, err, nil)
		return nil, false
	}
	logs.AttachDebugStep(r, "lock_gate_passed", map[string]any{"doc_count": len(ids), "held": len(rejects)})
	return rejects, true
}

// RefuseHeldDocuments answers 409 naming the held documents, reporting whether any were held.
func RefuseHeldDocuments(w http.ResponseWriter, r *http.Request, metrics *RequestMetricsTracker, collection string, rejects []documentlock.LockHeldElsewhereItem) bool {
	if len(rejects) == 0 {
		return false
	}
	metrics.Error("lock_conflict")
	RespondLockHeldElsewhereJSON(w, r, collection, rejects)
	return true
}

// RespondLockHeldElsewhereJSON writes HTTP 409 with the standard document-lock
// conflict JSON body (`error`, `collection`, `saved`, `rejected[]`).
func RespondLockHeldElsewhereJSON(w http.ResponseWriter, r *http.Request, collection string, rejected []documentlock.LockHeldElsewhereItem) {
	RespondPartialLockHeldElsewhereJSON(w, r, collection, 0, nil, rejected)
}

// RespondPartialLockHeldElsewhereJSON answers a batch in which some documents
// were written and others are held elsewhere.
func RespondPartialLockHeldElsewhereJSON(w http.ResponseWriter, r *http.Request, collection string, saved int, savedDocIDs []string, rejected []documentlock.LockHeldElsewhereItem) {
	if rejected == nil {
		rejected = []documentlock.LockHeldElsewhereItem{}
	}
	if savedDocIDs == nil {
		savedDocIDs = []string{}
	}
	logs.AttachClientFailureDetail(r, "document lock held elsewhere", endpointFailureDetail("lock_held_elsewhere", "", map[string]any{
		"collection":     collection,
		"rejected_count": len(rejected),
		"saved":          saved,
	}))
	_ = EncodeJSONStatus(w, http.StatusConflict, map[string]any{
		"error":       documentlock.ErrCodeLockHeldElsewhere,
		"collection":  collection,
		"saved":       saved,
		"savedDocIDs": savedDocIDs,
		"rejected":    rejected,
	})
}
