package logs

import (
	"context"
	"net/http"
	"strings"

	"go.uber.org/zap"
)

type requestAccountIDKey struct{}
type requestSessionIDKey struct{}

// WithRequestAccountID stores the authenticated (or optionally resolved) account id on ctx for logging.
func WithRequestAccountID(ctx context.Context, accountID string) context.Context {
	accountID = strings.TrimSpace(accountID)
	if ctx == nil || accountID == "" {
		return ctx
	}
	return context.WithValue(ctx, requestAccountIDKey{}, accountID)
}

// WithRequestSessionID stores the authenticated (or optionally resolved) session id on ctx for logging.
func WithRequestSessionID(ctx context.Context, sessionID string) context.Context {
	sessionID = strings.TrimSpace(sessionID)
	if ctx == nil || sessionID == "" {
		return ctx
	}
	return context.WithValue(ctx, requestSessionIDKey{}, sessionID)
}

// RequestAccountIDFromContext returns the request account id when middleware or handlers bound it.
func RequestAccountIDFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	v, _ := ctx.Value(requestAccountIDKey{}).(string)
	return strings.TrimSpace(v)
}

// RequestSessionIDFromContext returns the request session id when middleware or handlers bound it.
func RequestSessionIDFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	v, _ := ctx.Value(requestSessionIDKey{}).(string)
	return strings.TrimSpace(v)
}

// BindRequestIdentity attaches account_id and session_id to ctx and enriches the request-scoped logger.
func BindRequestIdentity(ctx context.Context, accountID, sessionID string) context.Context {
	accountID = strings.TrimSpace(accountID)
	sessionID = strings.TrimSpace(sessionID)
	if accountID == "" && sessionID == "" {
		return ctx
	}
	if accountID != "" {
		ctx = WithRequestAccountID(ctx, accountID)
	}
	if sessionID != "" {
		ctx = WithRequestSessionID(ctx, sessionID)
	}
	var loggerFields []zap.Field
	if accountID != "" {
		loggerFields = append(loggerFields, zap.String("account_id", accountID))
	}
	if sessionID != "" {
		loggerFields = append(loggerFields, zap.String("session_id", sessionID))
	}
	if l, ok := ctx.Value(LoggerKey{}).(*zap.Logger); ok && l != nil && len(loggerFields) > 0 {
		ctx = ContextWithLogger(ctx, l.With(loggerFields...))
	}
	return ctx
}

// BindRequestAccountID attaches account_id to ctx and enriches the request-scoped logger when present.
func BindRequestAccountID(ctx context.Context, accountID string) context.Context {
	return BindRequestIdentity(ctx, accountID, "")
}

// BindRequestSessionID attaches session_id to ctx and enriches the request-scoped logger when present.
func BindRequestSessionID(ctx context.Context, sessionID string) context.Context {
	return BindRequestIdentity(ctx, "", sessionID)
}

// BindRequestIdentityToRequest is the HTTP helper for [BindRequestIdentity].
func BindRequestIdentityToRequest(r *http.Request, accountID, sessionID string) *http.Request {
	if r == nil {
		return r
	}
	return r.WithContext(BindRequestIdentity(r.Context(), accountID, sessionID))
}

// BindRequestAccountIDToRequest is the HTTP helper for [BindRequestAccountID].
func BindRequestAccountIDToRequest(r *http.Request, accountID string) *http.Request {
	return BindRequestIdentityToRequest(r, accountID, "")
}

func kvContainsKey(kv []any, key string) bool {
	for i := 0; i+1 < len(kv); i += 2 {
		if k, ok := kv[i].(string); ok && k == key {
			return true
		}
	}
	return false
}

// RequestIdentityFromRequest returns account_id and session_id bound on the request context,
// or from handler success/failure detail when inner middleware updated a child *http.Request only.
func RequestIdentityFromRequest(r *http.Request) (accountID, sessionID string) {
	if r == nil {
		return "", ""
	}
	accountID = RequestAccountIDFromContext(r.Context())
	sessionID = RequestSessionIDFromContext(r.Context())
	if accountID != "" && sessionID != "" {
		return accountID, sessionID
	}
	identityFromDetail := func(detail map[string]interface{}) {
		if detail == nil {
			return
		}
		if accountID == "" {
			if v, ok := detail["account_id"].(string); ok {
				accountID = strings.TrimSpace(v)
			}
		}
		if sessionID == "" {
			if v, ok := detail["session_id"].(string); ok {
				sessionID = strings.TrimSpace(v)
			}
		}
	}
	identityFromDetail(HandlerFailureDetailFromRequest(r))
	if accountID != "" && sessionID != "" {
		return accountID, sessionID
	}
	if _, successDet, _ := HandlerSuccessFromRequest(r); len(successDet) > 0 {
		identityFromDetail(successDet)
	}
	return accountID, sessionID
}

func enrichFailureDetailRequestIdentity(ctx context.Context, detail map[string]interface{}) {
	if detail == nil {
		return
	}
	if _, ok := detail["account_id"]; !ok {
		if id := RequestAccountIDFromContext(ctx); id != "" {
			detail["account_id"] = id
		}
	}
	if _, ok := detail["session_id"]; !ok {
		if id := RequestSessionIDFromContext(ctx); id != "" {
			detail["session_id"] = id
		}
	}
	if debugIdentityFromContext == nil {
		return
	}
	acc, sess := debugIdentityFromContext(ctx)
	if _, ok := detail["account_id"]; !ok && acc != "" {
		detail["account_id"] = acc
	}
	if _, ok := detail["session_id"]; !ok && sess != "" {
		detail["session_id"] = sess
	}
}
