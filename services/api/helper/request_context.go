package helper

import (
	"context"
	"net/http"
	"time"

	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
)

// RequestStartOrNow returns middleware request start time or current time.
func RequestStartOrNow(ctx context.Context) time.Time {
	start, ok := logs.RequestStartTime(ctx)
	if !ok {
		return time.Now()
	}
	return start
}

// PopulateRequestMeta fills account id, session id (from auth context / cookie), and client id (X-WS-Client-ID).
// Bulk upserts use the same session/client pairing via eipmongo.ApplyMetaSessionClient.
func PopulateRequestMeta(r *http.Request, meta *models.MetaData, accountID string) {
	if meta == nil {
		return
	}
	meta.AccountID = accountID
	if sessionID := auth.SessionIDFromContext(r.Context()); sessionID != "" {
		meta.SessionID = sessionID
	}
	if wsClientID := ExtractWSClientID(r); wsClientID != "" {
		meta.ClientID = wsClientID
	}
}

// RetryWithoutWSClientID retries once after clearing ws client metadata.
func RetryWithoutWSClientID(wsClientID string, clearWSClientID func(), op func() error) error {
	err := op()
	if err == nil || wsClientID == "" {
		return err
	}
	clearWSClientID()
	return op()
}
