package auth

import (
	"net/http"
	"strings"
)

// AppRefreshCookieName is the legacy HttpOnly refresh cookie (unused for per-tab sessions).
const AppRefreshCookieName = "eip_app_refresh"

// appRefreshCookiePath scopes the cookie to auth endpoints only.
const appRefreshCookiePath = "/api/v1/auth"

// AppRefreshCookieMaxAgeSeconds matches RefreshTokenTTL.
func AppRefreshCookieMaxAgeSeconds() int {
	return int(RefreshTokenTTL.Seconds())
}

// SetAppRefreshCookie sets the HttpOnly app refresh cookie.
func SetAppRefreshCookie(w http.ResponseWriter, r *http.Request, refreshToken string) {
	_ = r
	if refreshToken == "" || w == nil {
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     AppRefreshCookieName,
		Value:    refreshToken,
		Path:     appRefreshCookiePath,
		MaxAge:   AppRefreshCookieMaxAgeSeconds(),
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
}

// ClearAppRefreshCookie clears the app refresh cookie (e.g. logout).
func ClearAppRefreshCookie(w http.ResponseWriter, r *http.Request) {
	_ = r
	if w == nil {
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     AppRefreshCookieName,
		Value:    "",
		Path:     appRefreshCookiePath,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
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
