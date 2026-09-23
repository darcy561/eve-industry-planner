package helper

import (
	"net/http"

	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/logs"
)

// RespondLockHeldElsewhereJSON writes HTTP 409 with the standard document-lock
// conflict JSON body (`error`, `collection`, `saved`, `rejected[]`).
//
// Nothing was written, which is what `saved` of zero says. A batch that wrote
// part of itself answers through [RespondPartialLockHeldElsewhereJSON] instead.
func RespondLockHeldElsewhereJSON(w http.ResponseWriter, r *http.Request, collection string, rejected []documentlock.LockHeldElsewhereItem) {
	RespondPartialLockHeldElsewhereJSON(w, r, collection, 0, nil, rejected)
}

// RespondPartialLockHeldElsewhereJSON answers a batch in which some documents
// were written and others are held elsewhere.
//
// Still 409, and still carrying every held document: the status describes the
// request's outcome, and a request that did not do everything it asked for is
// not a success. `saved` is what stops that being read as nothing happened, and
// it is the same shape a revision conflict answers with — a client meeting
// either has documents it must stop claiming it saved.
//
// `savedDocIDs` names them. A count cannot: one batch can hold a document and
// refuse another on its revision, and a response says one of the two, so a
// client working out what wrote by subtracting what it was told about would
// count a document that never landed.
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
