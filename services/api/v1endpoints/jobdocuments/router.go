package jobdocuments

import (
	"net/http"
	"strings"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/shared"
)

// JobDocumentsRouter routes /api/v1/job-documents (filtered reads + batch write/delete on user_job_documents).
func JobDocumentsRouter(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	path := r.URL.Path
	method := r.Method

	switch {
	case path == "/api/v1/job-documents" || path == "/api/v1/job-documents/":
		switch method {
		case http.MethodPost:
			GetJobDocumentsByIDsHandler(w, r, clients)
		case http.MethodPut:
			PutJobDocumentsHandler(w, r, clients)
		case http.MethodDelete:
			DeleteJobDocumentsHandler(w, r, clients)
		default:
			helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed", "invalid method for job-documents collection", "job_docs_method_not_allowed", "job_documents", nil, map[string]interface{}{"method": method})
		}
	default:
		const prefix = "/api/v1/job-documents/"
		if !strings.HasPrefix(path, prefix) {
			helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found", "job-documents route not found", "job_docs_not_found", "job_documents", nil, map[string]interface{}{"path": path})
			return
		}
		rest := strings.TrimSuffix(strings.TrimPrefix(path, prefix), "/")
		if rest == "" || strings.Contains(rest, "/") {
			helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found", "job-documents route not found", "job_docs_not_found", "job_documents", nil, map[string]interface{}{"path": path})
			return
		}

		switch {
		case rest == "planner":
			if method != http.MethodGet {
				helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed", "invalid method for job-documents planner route", "job_docs_method_not_allowed", "job_documents", nil, map[string]interface{}{"method": method, "route": rest})
				return
			}
			GetPlannerJobDocumentsHandler(w, r, clients)

		case strings.HasPrefix(rest, "by-group/"):
			groupID := strings.TrimPrefix(rest, "by-group/")
			if groupID == "" {
				helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found", "job-documents by-group route missing group id", "job_docs_not_found", "job_documents", nil, map[string]interface{}{"path": path})
				return
			}
			if method != http.MethodGet {
				helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed", "invalid method for job-documents by-group route", "job_docs_method_not_allowed", "job_documents", nil, map[string]interface{}{"method": method, "route": rest})
				return
			}
			GetJobDocumentsByGroupHandler(w, r, clients, groupID)

		default:
			if method != http.MethodGet {
				helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed", "invalid method for job-documents by-id route", "job_docs_method_not_allowed", "job_documents", nil, map[string]interface{}{"method": method, "route": rest})
				return
			}
			GetJobDocumentByIDHandler(w, r, clients, rest)
		}
	}
}
