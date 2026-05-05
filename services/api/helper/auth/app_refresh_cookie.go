package auth

import (
	"net/http"
	"strings"
)

// AppRefreshCookieName is the HttpOnly cookie holding the server app refresh token (cloud-account users).
const AppRefreshCookieName = "eip_app_refresh"

// appRefreshCookiePath scopes the cookie to auth endpoints only.
const appRefreshCookiePath = "/api/v1/auth"

// AppRefreshCookieMaxAgeSeconds matches RefreshTokenTTL.
func AppRefreshCookieMaxAgeSeconds() int {
	return int(RefreshTokenTTL.Seconds())
}

func isHTTPSRequest(r *http.Request) bool {
	if r == nil {
		return false
	}
	if r.TLS != nil {
		return true
	}
	if proto := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")); proto != "" {
		return strings.EqualFold(proto, "https")
	}
	return false
}

// SetAppRefreshCookie sets the HttpOnly app refresh cookie (cloud users).
func SetAppRefreshCookie(w http.ResponseWriter, r *http.Request, refreshToken string) {
	if refreshToken == "" || w == nil {
		return
	}
	secure := isHTTPSRequest(r)
	http.SetCookie(w, &http.Cookie{
		Name:     AppRefreshCookieName,
		Value:    refreshToken,
		Path:     appRefreshCookiePath,
		MaxAge:   AppRefreshCookieMaxAgeSeconds(),
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// ClearAppRefreshCookie clears the app refresh cookie (e.g. logout).
func ClearAppRefreshCookie(w http.ResponseWriter, r *http.Request) {
	if w == nil {
		return
	}
	secure := isHTTPSRequest(r)
	http.SetCookie(w, &http.Cookie{
		Name:     AppRefreshCookieName,
		Value:    "",
		Path:     appRefreshCookiePath,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// ReadAppRefreshCookie returns the cookie value or empty string.
func ReadAppRefreshCookie(r *http.Request) string {
	if r == nil {
		return ""
	}
	c, err := r.Cookie(AppRefreshCookieName)
	if err != nil || c == nil {
		return ""
	}
	return strings.TrimSpace(c.Value)
}
