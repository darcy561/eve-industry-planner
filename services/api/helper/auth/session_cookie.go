package auth

import (
	"net/http"
	"strings"
)

// AppSessionCookieName is the legacy shared session cookie (fallback only).
// Per-tab sessions use X-Session-ID (HTTP) or planner_session_id (WebSocket query).
const AppSessionCookieName = "eip_session"

// PlannerSessionIDHeader is the per-tab planner session id on HTTP requests.
const PlannerSessionIDHeader = "X-Session-ID"

// PlannerSessionIDQueryParam is the per-tab planner session id on WebSocket upgrade.
const PlannerSessionIDQueryParam = "planner_session_id"

const appSessionCookiePath = "/"

func AppSessionCookieMaxAgeSeconds() int {
	return int(RefreshTokenTTL.Seconds())
}

func SetAppSessionCookie(w http.ResponseWriter, sessionID string) {
	if w == nil || sessionID == "" {
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     AppSessionCookieName,
		Value:    sessionID,
		Path:     appSessionCookiePath,
		MaxAge:   AppSessionCookieMaxAgeSeconds(),
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
}

func ClearAppSessionCookie(w http.ResponseWriter) {
	if w == nil {
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     AppSessionCookieName,
		Value:    "",
		Path:     appSessionCookiePath,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
}

func ReadAppSessionCookie(r *http.Request) string {
	if r == nil {
		return ""
	}
	c, err := r.Cookie(AppSessionCookieName)
	if err != nil || c == nil {
		return ""
	}
	return strings.TrimSpace(c.Value)
}

// ResolvePlannerSessionID returns the active planner session for this request/tab.
// Priority: X-Session-ID header, planner_session_id query (WebSocket), legacy eip_session cookie.
func ResolvePlannerSessionID(r *http.Request) string {
	if r == nil {
		return ""
	}
	if sid := strings.TrimSpace(r.Header.Get(PlannerSessionIDHeader)); sid != "" {
		return sid
	}
	if r.URL != nil {
		if sid := strings.TrimSpace(r.URL.Query().Get(PlannerSessionIDQueryParam)); sid != "" {
			return sid
		}
	}
	return ReadAppSessionCookie(r)
}
