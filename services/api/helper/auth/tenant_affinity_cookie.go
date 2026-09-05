package auth

import (
	"net/http"
	"strings"

	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/wsplacement"
)

// TenantAffinityCookieName is the tenant cohort cookie for ws-router place lookup (/ws).
// See shared/wsplacement (AffinityCookie) and backend/ws-router when promoted.
const TenantAffinityCookieName = wsplacement.AffinityCookie

const tenantAffinityCookiePath = "/"

// FormatTenantAffinityKey builds alliance:{ref} → corporation:{ref} → account:{id}.
// Organisations are named by ref, so this cookie never carries an EVE entity id:
// a non-ref organisation value yields a zero owner and falls through. accountID
// must be non-empty for a usable key.
func FormatTenantAffinityKey(accountID, corporationRef, allianceRef string) string {
	for _, owner := range []models.Owner{
		models.AllianceOwner(allianceRef),
		models.CorporationOwner(corporationRef),
		models.AccountOwner(accountID),
	} {
		if owner.Validate() == nil {
			return owner.Key()
		}
	}
	return ""
}

// SetTenantAffinityCookie sets eip_tenant_affinity (Path=/) for ws-router place lookup.
func SetTenantAffinityCookie(w http.ResponseWriter, r *http.Request, accountID, corporationRef, allianceRef string) {
	_ = r
	if w == nil {
		return
	}
	value := FormatTenantAffinityKey(accountID, corporationRef, allianceRef)
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
