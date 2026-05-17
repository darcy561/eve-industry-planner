package auth

import (
	"net/http"
	"strings"
)

// EsiOAuthStorageCookieName mirrors bootstrap JSON esi_oauth_storage for client routing (non-secret).
const EsiOAuthStorageCookieName = "eip_esi_oauth_storage"

const (
	// EsiOAuthStorageServer means OAuth refresh material may live server-side (Mongo).
	EsiOAuthStorageServer = "server"
	// EsiOAuthStorageClient means client-held OAuth refresh (browser storage).
	EsiOAuthStorageClient = "client"
)

// esiOAuthStorageCookiePath is "/" so the SPA can read the hint before hitting nested routes.
const esiOAuthStorageCookiePath = "/"

// SetEsiOAuthStorageCookie sets the routing cookie ("server" | "client").
func SetEsiOAuthStorageCookie(w http.ResponseWriter, r *http.Request, mode string) {
	_ = r
	if w == nil {
		return
	}
	mode = strings.TrimSpace(strings.ToLower(mode))
	if mode != EsiOAuthStorageServer && mode != EsiOAuthStorageClient {
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     EsiOAuthStorageCookieName,
		Value:    mode,
		Path:     esiOAuthStorageCookiePath,
		MaxAge:   AppRefreshCookieMaxAgeSeconds(),
		HttpOnly: false,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
}

// SetEsiOAuthStorageCookieFromUserCloud mirrors UserCloudAccounts onto the cookie value.
func SetEsiOAuthStorageCookieFromUserCloud(w http.ResponseWriter, r *http.Request, userCloudAccounts bool) {
	if userCloudAccounts {
		SetEsiOAuthStorageCookie(w, r, EsiOAuthStorageServer)
		return
	}
	SetEsiOAuthStorageCookie(w, r, EsiOAuthStorageClient)
}

// ClearEsiOAuthStorageCookie clears the routing cookie (e.g. logout).
func ClearEsiOAuthStorageCookie(w http.ResponseWriter, r *http.Request) {
	_ = r
	if w == nil {
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     EsiOAuthStorageCookieName,
		Value:    "",
		Path:     esiOAuthStorageCookiePath,
		MaxAge:   -1,
		HttpOnly: false,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
}
