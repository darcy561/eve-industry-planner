package auth

import (
	"errors"
	"maps"
	"net/http"
	"strings"

	"eve-industry-planner/shared/dependency"
)

// AuthSessionError is returned by ExtractAccountSession for client-facing auth failure codes.
// Error() returns the API code (session_missing, session_revoked, reauth_required).
type AuthSessionError struct {
	Code      string
	AccountID string
	SessionID string
	Reason    string
}

func (e *AuthSessionError) Error() string {
	if e == nil {
		return ""
	}
	return e.Code
}

const (
	authSessionReasonSessionAbsent       = "session_absent"
	authSessionReasonCookieAbsent        = "cookie_absent" // legacy alias in logs/tests
	authSessionReasonSessionIndexMissing = "session_index_not_found"
	authSessionReasonSessionRowMissing   = "session_row_missing"
	authSessionReasonRedisError          = "redis_error"
)

// IsInfrastructureError reports auth/session failures caused by Redis being unreachable
// rather than a missing or invalid session.
func IsInfrastructureError(err error) bool {
	if err == nil {
		return false
	}
	var authErr *AuthSessionError
	if errors.As(err, &authErr) && authErr != nil && authErr.Reason == authSessionReasonRedisError {
		return true
	}
	return dependency.IsUnavailable(err)
}

// AuthSessionFailureDetail is safe diagnostic context for invalid session logs (no secrets beyond ids).
type AuthSessionFailureDetail struct {
	Code                      string
	AccountID                 string
	SessionID                 string
	HasEipSessionCookie       bool
	HasPlannerSessionIDHeader bool
	Reason                    string
}

// AuthSessionFailureDetailFromError builds log context from an auth session validation error.
func AuthSessionFailureDetailFromError(err error, r *http.Request) AuthSessionFailureDetail {
	d := AuthSessionFailureDetail{
		HasEipSessionCookie:       strings.TrimSpace(ReadAppSessionCookie(r)) != "",
		HasPlannerSessionIDHeader: strings.TrimSpace(r.Header.Get(PlannerSessionIDHeader)) != "",
	}
	var authErr *AuthSessionError
	if errors.As(err, &authErr) && authErr != nil {
		d.Code = authErr.Code
		d.AccountID = authErr.AccountID
		d.SessionID = authErr.SessionID
		d.Reason = authErr.Reason
		return d
	}
	if err != nil {
		d.Code = err.Error()
	}
	return d
}

// ClientFailureMessage returns the consolidated access-log message for request logging middleware.
func (d AuthSessionFailureDetail) ClientFailureMessage() string {
	switch d.Code {
	case "session_missing":
		return "auth session missing or invalid"
	case "session_revoked":
		return "auth session revoked"
	case "reauth_required":
		return "auth session reauth required"
	default:
		return "auth session validation failed"
	}
}

// ClientFailureDetail returns structured fields for consolidated 4xx request logging.
func (d AuthSessionFailureDetail) ClientFailureDetail(extra map[string]any) map[string]any {
	out := map[string]any{
		"failure_class":                 authSessionFailureClass(d.Code),
		"code":                          d.Code,
		"has_eip_session_cookie":        d.HasEipSessionCookie,
		"has_planner_session_id_header": d.HasPlannerSessionIDHeader,
	}
	if d.AccountID != "" {
		out["account_id"] = d.AccountID
	}
	if d.SessionID != "" {
		out["session_id"] = d.SessionID
	}
	if d.Reason != "" {
		out["reason"] = d.Reason
	}
	maps.Copy(out, extra)
	return out
}

func authSessionFailureClass(code string) string {
	switch code {
	case "session_missing":
		return "auth_session_missing"
	case "session_revoked":
		return "auth_session_revoked"
	case "reauth_required":
		return "auth_reauth_required"
	default:
		return "auth_session_invalid"
	}
}

// LogFields returns structured key/value pairs for direct WarnCtx (e.g. websocket without access logging).
func (d AuthSessionFailureDetail) LogFields(extra ...any) []any {
	fields := make([]any, 0, 8+len(extra))
	fields = append(fields,
		"code", d.Code,
		"has_eip_session_cookie", d.HasEipSessionCookie,
	)
	if d.AccountID != "" {
		fields = append(fields, "account_id", d.AccountID)
	}
	if d.SessionID != "" {
		fields = append(fields, "session_id", d.SessionID)
	}
	if d.Reason != "" {
		fields = append(fields, "reason", d.Reason)
	}
	return append(fields, extra...)
}
