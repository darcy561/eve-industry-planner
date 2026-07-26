package auth

import (
	"net/http"
	"strings"
)

// RefreshCredentialLogDetail is safe diagnostic context for refresh/bootstrap/rotate (no full secrets).
type RefreshCredentialLogDetail struct {
	SessionEndpoint        string
	RefreshFromCookie      bool
	CredentialSource       string
	RefreshTokenLen        int
	RefreshTokenIDHint     string
	HasEipSessionCookie    bool
	HasEipAppRefreshCookie bool
	HasEveTokenBody        bool
	LikelyCause            string
}

// BuildRefreshCredentialLogDetail builds log/metrics context for a refresh request.
func BuildRefreshCredentialLogDetail(r *http.Request, sessionEndpoint, refreshToken string, refreshFromCookie bool, eveToken string) RefreshCredentialLogDetail {
	source := "none"
	switch {
	case refreshFromCookie:
		source = "eip_app_refresh_cookie"
	case strings.TrimSpace(refreshToken) != "":
		source = "json_body"
	}
	return RefreshCredentialLogDetail{
		SessionEndpoint:        sessionEndpoint,
		RefreshFromCookie:      refreshFromCookie,
		CredentialSource:       source,
		RefreshTokenLen:        len(strings.TrimSpace(refreshToken)),
		RefreshTokenIDHint:     refreshTokenIDHint(refreshToken),
		HasEipSessionCookie:    strings.TrimSpace(ReadAppSessionCookie(r)) != "",
		HasEipAppRefreshCookie: strings.TrimSpace(ReadAppRefreshCookie(r)) != "",
		HasEveTokenBody:        strings.TrimSpace(eveToken) != "",
		LikelyCause:            likelyRefreshTokenNotFoundCause(refreshFromCookie, source),
	}
}

func refreshTokenIDHint(token string) string {
	t := strings.TrimSpace(token)
	switch {
	case t == "":
		return ""
	case len(t) <= 8:
		return "short"
	default:
		return t[len(t)-8:]
	}
}

// ClientFailureDetail returns structured fields for consolidated 4xx request logging (no full secrets).
func (d RefreshCredentialLogDetail) ClientFailureDetail(failureClass string, extra map[string]interface{}) map[string]interface{} {
	out := map[string]interface{}{
		"failure_class":              failureClass,
		"session_endpoint":           d.SessionEndpoint,
		"credential_source":          d.CredentialSource,
		"refresh_from_cookie":        d.RefreshFromCookie,
		"refresh_token_len":          d.RefreshTokenLen,
		"refresh_token_id_hint":      d.RefreshTokenIDHint,
		"has_eip_session_cookie":     d.HasEipSessionCookie,
		"has_eip_app_refresh_cookie": d.HasEipAppRefreshCookie,
		"has_eve_token_body":         d.HasEveTokenBody,
		"likely_cause":               d.LikelyCause,
	}
	for k, v := range extra {
		out[k] = v
	}
	return out
}

func likelyRefreshTokenNotFoundCause(refreshFromCookie bool, credentialSource string) string {
	if credentialSource == "none" {
		return "no_refresh_material_presented"
	}
	if refreshFromCookie {
		return "stale_or_revoked_eip_app_refresh_cookie_after_rotate_ttl_logout_or_cleanup"
	}
	return "stale_or_revoked_body_refresh_token_typical_multi_tab_or_local_account"
}
