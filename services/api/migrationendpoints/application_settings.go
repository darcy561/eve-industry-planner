package migrationendpoints

import (
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/api/migration"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/logs"
)

func ApplicationSettingsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	switch r.Method {
	case http.MethodGet:
		ApplicationSettingsGetHandler(w, r, clients)
	case http.MethodPut:
		ApplicationSettingsPutHandler(w, r, clients)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func ApplicationSettingsGetHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	start := time.Now()
	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		logs.WarnCtx(r.Context(), "failed to extract accountID for migration application settings", "error", err, "ip", r.RemoteAddr)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	doc, err := migration.GetApplicationSettingsFromFirebase(r.Context(), accountID)
	if err != nil {
		logs.ErrorCtx(r.Context(), "failed to fetch application settings from firebase", "error", err, "account_id", accountID, "ip", r.RemoteAddr)
		http.Error(w, "Failed to retrieve application settings", http.StatusInternalServerError)
		return
	}

	if doc == nil {
		http.Error(w, "Application settings not found", http.StatusNotFound)
		return
	}

	if clients.JetStream != nil && clients.NATS != nil {
		migration.EnqueueMigrateUserDocumentToMongo(r.Context(), clients.JetStream, accountID, clients.NATS)
	}

	if err := helper.EncodeJSON(w, doc); err != nil {
		logs.ErrorCtx(r.Context(), "failed to encode application settings response", "error", err, "account_id", accountID)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	logs.InfoCtx(r.Context(), "migration application settings retrieved from firebase",
		"account_id", accountID,
		"duration_ms", time.Since(start).Milliseconds())
}

func ApplicationSettingsPutHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	start := time.Now()
	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		logs.WarnCtx(r.Context(), "failed to extract accountID for migration application settings POST", "error", err, "ip", r.RemoteAddr)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var doc map[string]any
	if err := helper.DecodeJSONRequest(r, &doc, helper.DefaultMaxBodySize); err != nil {
		logs.WarnCtx(r.Context(), "invalid application settings POST body", "error", err, "account_id", accountID)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := migration.SaveApplicationSettingsToFirebase(r.Context(), accountID, doc); err != nil {
		logs.ErrorCtx(r.Context(), "failed to save application settings to firebase", "error", err, "account_id", accountID, "ip", r.RemoteAddr)
		http.Error(w, "Failed to save application settings", http.StatusInternalServerError)
		return
	}

	if clients.Mongo != nil {
		migration.TrySaveApplicationSettingsToMongo(r.Context(), clients.Mongo, accountID, doc)
	}

	w.WriteHeader(http.StatusNoContent)
	logs.InfoCtx(r.Context(), "migration application settings saved to firebase",
		"account_id", accountID,
		"duration_ms", time.Since(start).Milliseconds())
}
