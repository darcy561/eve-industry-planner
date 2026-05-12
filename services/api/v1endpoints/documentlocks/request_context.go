package documentlocks

import (
	"context"
	"net/http"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"

	"github.com/redis/go-redis/v9"
)

// lockHandlerContext is the shared preamble state every mutating doc-lock
// handler needs: account + session identity, the parsed `{collection, docID}`
// body, the Redis client (verified non-nil), and the request context.
//
// `lockHandlerContextOK` writes the appropriate 4xx/5xx response and returns
// `ok: false` on any failure (missing account, missing session claim, bad
// body, Redis unavailable). Handlers should `return` immediately when
// `ok == false`.
type lockHandlerContext struct {
	Ctx        context.Context
	AccountID  string
	SessionID  string
	Collection string
	DocID      string
	Redis      *redis.Client
}

// lockHandlerContextOK gathers the standard preamble for every mutating
// doc-lock HTTP handler in this package. See `lockHandlerContext` for the
// fields. On any auth/parse/redis error the response has already been written
// to `w`; the caller just returns.
func lockHandlerContextOK(w http.ResponseWriter, r *http.Request, redisClient *redis.Client) (lockHandlerContext, bool) {
	accountID, ok := helper.RequireAccountID(w, r)
	if !ok {
		return lockHandlerContext{}, false
	}
	sessionID, err := auth.ExtractSessionID(r)
	if err != nil {
		http.Error(w, "session_id claim required", http.StatusBadRequest)
		return lockHandlerContext{}, false
	}
	b, err := parseLockBody(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return lockHandlerContext{}, false
	}
	if redisClient == nil {
		http.Error(w, "Locks unavailable", http.StatusServiceUnavailable)
		return lockHandlerContext{}, false
	}
	return lockHandlerContext{
		Ctx:        r.Context(),
		AccountID:  accountID,
		SessionID:  sessionID,
		Collection: b.Collection,
		DocID:      b.DocID,
		Redis:      redisClient,
	}, true
}
