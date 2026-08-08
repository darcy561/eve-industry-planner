package documentlocks

import (
	"net/http"

	"eve-industry-planner/api/helper"
)

// Router serves /api/v1/document-locks/{action}
func (h *Handlers) Router(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	switch {
	case path == "/api/v1/document-locks/acquire" || path == "/api/v1/document-locks/acquire/":
		if r.Method == http.MethodPost {
			h.handleAcquire(w, r)
			return
		}
	case path == "/api/v1/document-locks/extend" || path == "/api/v1/document-locks/extend/":
		if r.Method == http.MethodPost {
			h.handleExtend(w, r)
			return
		}
	case path == "/api/v1/document-locks/release" || path == "/api/v1/document-locks/release/":
		if r.Method == http.MethodPost {
			h.handleRelease(w, r)
			return
		}
	case path == "/api/v1/document-locks/force-release" || path == "/api/v1/document-locks/force-release/":
		if r.Method == http.MethodPost {
			h.handleForceRelease(w, r)
			return
		}
	case path == "/api/v1/document-locks/hand-over" || path == "/api/v1/document-locks/hand-over/":
		if r.Method == http.MethodPost {
			h.handleHandOver(w, r)
			return
		}
	case path == "/api/v1/document-locks/request" || path == "/api/v1/document-locks/request/":
		if r.Method == http.MethodPost {
			h.handleRequest(w, r)
			return
		}
	case path == "/api/v1/document-locks/lock-state-batch" || path == "/api/v1/document-locks/lock-state-batch/":
		if r.Method == http.MethodPost {
			h.handleLockStateBatch(w, r)
			return
		}
	case path == "/api/v1/document-locks/lock-state" || path == "/api/v1/document-locks/lock-state/":
		if r.Method == http.MethodGet {
			h.handleLockState(w, r)
			return
		}
	case path == "/api/v1/document-locks/claim-handoff" || path == "/api/v1/document-locks/claim-handoff/":
		if r.Method == http.MethodPost {
			h.handleClaimHandoff(w, r)
			return
		}
	case path == "/api/v1/document-locks/waitlist-pulse" || path == "/api/v1/document-locks/waitlist-pulse/":
		if r.Method == http.MethodPost {
			h.handleWaitlistPulse(w, r)
			return
		}
	case path == "/api/v1/document-locks/viewer-arrived" || path == "/api/v1/document-locks/viewer-arrived/":
		if r.Method == http.MethodPost {
			h.handleViewerArrived(w, r)
			return
		}
	case path == "/api/v1/document-locks/viewer-departed" || path == "/api/v1/document-locks/viewer-departed/":
		if r.Method == http.MethodPost {
			h.handleViewerDeparted(w, r)
			return
		}
	}
	helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found", "document-locks route not found", "document_locks_not_found", "document_locks", nil, map[string]any{"path": path})
}
