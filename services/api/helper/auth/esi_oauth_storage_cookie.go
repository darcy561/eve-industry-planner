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

const (
	AccountStorageCloud   = "cloud"
	AccountStorageLocal   = "local"
	AccountStorageUnknown = "unknown"
)

// AccountStorageLabel maps UserCloudAccounts to a log-friendly cloud/local label.
func AccountStorageLabel(userCloudAccounts bool) string {
	if userCloudAccounts {
		return AccountStorageCloud
	}
	return AccountStorageLocal
}

// AccountStorageLabelFromEsiOAuthStorage maps esi_oauth_storage cookie values to cloud/local.
func AccountStorageLabelFromEsiOAuthStorage(mode string) string {
	switch strings.TrimSpace(strings.ToLower(mode)) {
	case EsiOAuthStorageServer:
		return AccountStorageCloud
	case EsiOAuthStorageClient:
		return AccountStorageLocal
	default:
		return AccountStorageUnknown
	}
}

// ReadEsiOAuthStorageCookie returns the esi_oauth_storage routing cookie ("server" | "client"), if set.
func ReadEsiOAuthStorageCookie(r *http.Request) string {
	if r == nil {
		return ""
	}
	c, err := r.Cookie(EsiOAuthStorageCookieName)
	if err != nil || c == nil {
		return ""
	}
	return strings.TrimSpace(c.Value)
}

// AccountStorageLogPhrase returns a short label for log messages (e.g. "cloud account").
func AccountStorageLogPhrase(storage string) string {
	switch strings.TrimSpace(strings.ToLower(storage)) {
	case AccountStorageCloud:
		return "cloud account"
	case AccountStorageLocal:
		return "local account"
	default:
		return "unknown account"
	}
}

// ResolveSessionRefreshAccountStorage infers cloud vs local for planner session refresh logs.
// When userCloudAccounts is non-nil (bootstrap path), that value wins; otherwise the routing cookie
// and refresh credential shape are used.
func ResolveSessionRefreshAccountStorage(r *http.Request, userCloudAccounts *bool, refreshFromCookie bool, eveToken string) string {
	if userCloudAccounts != nil {
		return AccountStorageLabel(*userCloudAccounts)
	}
	if label := AccountStorageLabelFromEsiOAuthStorage(ReadEsiOAuthStorageCookie(r)); label != AccountStorageUnknown {
		return label
	}
	if refreshFromCookie && strings.TrimSpace(eveToken) == "" {
		return AccountStorageCloud
	}
	if !refreshFromCookie {
		return AccountStorageLocal
	}
	return AccountStorageUnknown
}

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
