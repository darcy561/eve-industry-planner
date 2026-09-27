package helper

import (
	"net/http"

	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/logs"
)

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
