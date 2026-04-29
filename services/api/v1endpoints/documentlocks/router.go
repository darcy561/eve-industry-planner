package documentlocks

import (
	"net/http"

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
	case path == "/api/v1/document-locks/request" || path == "/api/v1/document-locks/request/":
		if r.Method == http.MethodPost {
			handleRequest(w, r, clients)
			return
		}
	case path == "/api/v1/document-locks/status-batch" || path == "/api/v1/document-locks/status-batch/":
		if r.Method == http.MethodPost {
			handleStatusBatch(w, r, clients)
			return
		}
	case path == "/api/v1/document-locks/status" || path == "/api/v1/document-locks/status/":
		if r.Method == http.MethodGet {
			handleStatus(w, r, clients)
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
	}
	http.Error(w, "Not found", http.StatusNotFound)
}
