package v1endpoints

import (
	"net/http"

	"eve-industry-planner/api/v1endpoints/jobdocuments"
	"eve-industry-planner/shared/shared"
)

// JobDocumentsRouter delegates to jobdocuments handlers (GET planner / by-group / :id; PUT; DELETE).
func JobDocumentsRouter(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	jobdocuments.JobDocumentsRouter(w, r, clients)
}
