package jobdocuments

import (
	"net/http"
	"strings"

	"eve-industry-planner/shared"
	"eve-industry-planner/shared/logs"
)

// JobDocumentsRouter routes /api/v1/job-documents (filtered reads + batch write/delete on user_job_documents).
func JobDocumentsRouter(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
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
			logs.WarnCtx(ctx, "invalid method for job-documents collection")
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	default:
		const prefix = "/api/v1/job-documents/"
		if !strings.HasPrefix(path, prefix) {
			logs.WarnCtx(ctx, "job-documents route not found")
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		rest := strings.TrimSuffix(strings.TrimPrefix(path, prefix), "/")
		if rest == "" || strings.Contains(rest, "/") {
			logs.WarnCtx(ctx, "job-documents route not found")
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}

		switch {
		case rest == "planner":
			if method != http.MethodGet {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
				return
			}
			GetPlannerJobDocumentsHandler(w, r, clients)

		case strings.HasPrefix(rest, "by-group/"):
			groupID := strings.TrimPrefix(rest, "by-group/")
			if groupID == "" {
				http.Error(w, "Not found", http.StatusNotFound)
				return
			}
			if method != http.MethodGet {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
				return
			}
			GetJobDocumentsByGroupHandler(w, r, clients, groupID)

		default:
			if method != http.MethodGet {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
				return
			}
			GetJobDocumentByIDHandler(w, r, clients, rest)
		}
	}
}
