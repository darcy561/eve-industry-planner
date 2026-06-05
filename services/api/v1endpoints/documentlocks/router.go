package documentlocks

import (
	"net/http"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/shared"
)

// Router serves /api/v1/document-locks/{action}
func Router(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	path := r.URL.Path
	switch {
	case path == "/api/v1/document-locks/acquire" || path == "/api/v1/document-locks/acquire/":
		if r.Method == http.MethodPost {
			handleAcquire(w, r, clients)
			return
		}
	case path == "/api/v1/document-locks/extend" || path == "/api/v1/document-locks/extend/":
		if r.Method == http.MethodPost {
			handleExtend(w, r, clients)
			return
		}
	case path == "/api/v1/document-locks/release" || path == "/api/v1/document-locks/release/":
		if r.Method == http.MethodPost {
			handleRelease(w, r, clients)
			return
		}
	case path == "/api/v1/document-locks/force-release" || path == "/api/v1/document-locks/force-release/":
		if r.Method == http.MethodPost {
			handleForceRelease(w, r, clients)
			return
		}
	case path == "/api/v1/document-locks/hand-over" || path == "/api/v1/document-locks/hand-over/":
		if r.Method == http.MethodPost {
			handleHandOver(w, r, clients)
			return
		}
	case path == "/api/v1/document-locks/request" || path == "/api/v1/document-locks/request/":
		if r.Method == http.MethodPost {
			handleRequest(w, r, clients)
			return
		}
	case path == "/api/v1/document-locks/lock-state-batch" || path == "/api/v1/document-locks/lock-state-batch/":
		if r.Method == http.MethodPost {
			handleLockStateBatch(w, r, clients)
			return
		}
	case path == "/api/v1/document-locks/lock-state" || path == "/api/v1/document-locks/lock-state/":
		if r.Method == http.MethodGet {
			handleLockState(w, r, clients)
			return
		}
	case path == "/api/v1/document-locks/claim-handoff" || path == "/api/v1/document-locks/claim-handoff/":
		if r.Method == http.MethodPost {
			handleClaimHandoff(w, r, clients)
			return
		}
	case path == "/api/v1/document-locks/waitlist-pulse" || path == "/api/v1/document-locks/waitlist-pulse/":
		if r.Method == http.MethodPost {
			handleWaitlistPulse(w, r, clients)
			return
		}
	case path == "/api/v1/document-locks/viewer-arrived" || path == "/api/v1/document-locks/viewer-arrived/":
		if r.Method == http.MethodPost {
			handleViewerArrived(w, r, clients)
			return
		}
	case path == "/api/v1/document-locks/viewer-departed" || path == "/api/v1/document-locks/viewer-departed/":
		if r.Method == http.MethodPost {
			handleViewerDeparted(w, r, clients)
			return
		}
	}
	helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found", "document-locks route not found", "document_locks_not_found", "document_locks", nil, map[string]interface{}{"path": path})
}
