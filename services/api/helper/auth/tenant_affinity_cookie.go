package auth

import (
	"net/http"
	"strings"

	"eve-industry-planner/shared/wsplacement"
)

// TenantAffinityCookieName is the tenant cohort cookie for ws-router place lookup (/ws).
// See shared/wsplacement (AffinityCookie) and backend/ws-router when promoted.
const TenantAffinityCookieName = wsplacement.AffinityCookie

const tenantAffinityCookiePath = "/"

// FormatTenantAffinityKey builds alliance:{id} → corporation:{id} → account:{id}.
// Empty alliance/corp fall through; accountID must be non-empty for a usable key.
// Prefix shapes come from wsplacement.TenantKey*.
func FormatTenantAffinityKey(accountID, corporationID, allianceID string) string {
	if k := wsplacement.TenantKeyAlliance(allianceID); k != "" {
		return k
	}
	if k := wsplacement.TenantKeyCorporation(corporationID); k != "" {
		return k
	}
	return wsplacement.TenantKeyAccount(accountID)
}

// SetTenantAffinityCookie sets eip_tenant_affinity (Path=/) for ws-router place lookup.
func SetTenantAffinityCookie(w http.ResponseWriter, r *http.Request, accountID, corporationID, allianceID string) {
	_ = r
	if w == nil {
		return
	}
	value := FormatTenantAffinityKey(accountID, corporationID, allianceID)
	if value == "" {
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     TenantAffinityCookieName,
		Value:    value,
		Path:     tenantAffinityCookiePath,
		MaxAge:   AppRefreshCookieMaxAgeSeconds(),
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
}

// SetTenantAffinityCookieAccount sets account-key affinity.
func SetTenantAffinityCookieAccount(w http.ResponseWriter, r *http.Request, accountID string) {
	SetTenantAffinityCookie(w, r, accountID, "", "")
}

// ClearTenantAffinityCookie clears the affinity cookie (logout).
func ClearTenantAffinityCookie(w http.ResponseWriter, r *http.Request) {
	_ = r
	if w == nil {
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     TenantAffinityCookieName,
		Value:    "",
		Path:     tenantAffinityCookiePath,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
}

// ReadTenantAffinityCookie returns the raw cookie value, if set.
func ReadTenantAffinityCookie(r *http.Request) string {
	if r == nil {
		return ""
	}
	c, err := r.Cookie(TenantAffinityCookieName)
	if err != nil || c == nil {
		return ""
	}
	return strings.TrimSpace(c.Value)
}
