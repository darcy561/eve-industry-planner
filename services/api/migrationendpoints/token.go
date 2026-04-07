package migrationendpoints

import (
	"net/http"
	"time"

	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/api/migration"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/logs"
)

type firebaseTokenResponse struct {
	AccessToken      string `json:"access_token"`
	IsFirstTimeLogin bool   `json:"isFirstTimeLogin"`
}

// FirebaseTokenHandler generates a Firebase custom token for the authenticated user.
// This allows the frontend to continue accessing Firebase while migration is in progress.
func FirebaseTokenHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	start, ok := logs.RequestStartTime(r.Context())
	if !ok {
		start = time.Now()
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		logs.WarnCtx(r.Context(), "failed to extract accountID for migration firebase token", "error", err)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	token, isFirstTime, err := migration.GenerateFirebaseCustomToken(r.Context(), accountID)
	if err != nil {
		logs.ErrorCtx(r.Context(), "failed to generate firebase custom token", "error", err, "account_id", accountID)
		http.Error(w, "Failed to generate Firebase token", http.StatusInternalServerError)
		return
	}

	resp := firebaseTokenResponse{
		AccessToken:      token,
		IsFirstTimeLogin: isFirstTime,
	}

	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write([]byte(`{"access_token":"` + resp.AccessToken + `","isFirstTimeLogin":` + boolToJSON(resp.IsFirstTimeLogin) + `}`)); err != nil {
		logs.ErrorCtx(r.Context(), "failed to write firebase token response", "error", err, "account_id", accountID)
		return
	}

	logs.InfoCtx(r.Context(), "migration firebase token generated",
		"account_id", accountID,
		"duration_ms", time.Since(start).Milliseconds())
}

func boolToJSON(b bool) string {
	if b {
		return "true"
	}
	return "false"
}
