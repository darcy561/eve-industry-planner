package jobdocuments

import (
	"net/http"
	"strings"

	"eve-industry-planner/api/helper"
)

// Router routes /api/v1/job-documents (filtered reads + batch write/delete on user_job_documents).
func (h *Handlers) Router(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	method := r.Method

	switch {
	case path == "/api/v1/job-documents" || path == "/api/v1/job-documents/":
		switch method {
		case http.MethodPost:
			h.GetJobDocumentsByIDsHandler(w, r)
		case http.MethodPut:
			h.PutJobDocumentsHandler(w, r)
		case http.MethodDelete:
			h.DeleteJobDocumentsHandler(w, r)
		default:
			helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed", "invalid method for job-documents collection", "job_docs_method_not_allowed", "job_documents", nil, map[string]any{"method": method})
		}
	default:
		const prefix = "/api/v1/job-documents/"
		if !strings.HasPrefix(path, prefix) {
			helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found", "job-documents route not found", "job_docs_not_found", "job_documents", nil, map[string]any{"path": path})
			return
		}
		rest := strings.TrimSuffix(strings.TrimPrefix(path, prefix), "/")
		if rest == "" || strings.Contains(rest, "/") {
			helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found", "job-documents route not found", "job_docs_not_found", "job_documents", nil, map[string]any{"path": path})
			return
		}

		switch {
		case rest == "planner":
			if method != http.MethodGet {
				helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed", "invalid method for job-documents planner route", "job_docs_method_not_allowed", "job_documents", nil, map[string]any{"method": method, "route": rest})
				return
			}
			h.GetPlannerJobDocumentsHandler(w, r)

		case strings.HasPrefix(rest, "by-group/"):
			groupID := strings.TrimPrefix(rest, "by-group/")
			if groupID == "" {
				helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found", "job-documents by-group route missing group id", "job_docs_not_found", "job_documents", nil, map[string]any{"path": path})
				return
			}
			if method != http.MethodGet {
				helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed", "invalid method for job-documents by-group route", "job_docs_method_not_allowed", "job_documents", nil, map[string]any{"method": method, "route": rest})
				return
			}
			h.GetJobDocumentsByGroupHandler(w, r, groupID)

		default:
			if method != http.MethodGet {
				helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed", "invalid method for job-documents by-id route", "job_docs_method_not_allowed", "job_documents", nil, map[string]any{"method": method, "route": rest})
				return
			}
			h.GetJobDocumentByIDHandler(w, r, rest)
		}
	}
}
