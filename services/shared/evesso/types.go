package evesso

import (
	"os"
	"strings"
)

const (
	MaxAuthCodeLength     = 512
	MaxRefreshTokenLength = 512
	// DefaultBaseURL is where EVE SSO lives.
	DefaultBaseURL = "https://login.eveonline.com"
)

// BaseURL is the EVE SSO host. EVE_SSO_BASE_URL overrides it, which is how a
// test points the token exchange at a fake without every caller passing a URL.
func BaseURL() string {
	if base := strings.TrimRight(strings.TrimSpace(os.Getenv("EVE_SSO_BASE_URL")), "/"); base != "" {
		return base
	}
	return DefaultBaseURL
}

// TokenURL is the OAuth token endpoint.
func TokenURL() string { return BaseURL() + "/v2/oauth/token" }

// MetadataURL is the OAuth authorization-server metadata document, which names
// the JWKS endpoint used to verify access tokens.
func MetadataURL() string { return BaseURL() + "/.well-known/oauth-authorization-server" }

// EveSSOTokenPayload is the JSON body from login.eveonline.com token responses.
type EveSSOTokenPayload struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token,omitempty"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
}

// EveSSOErrorResponse is the JSON error body from failed OAuth token requests.
type EveSSOErrorResponse struct {
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description"`
}

type eveSSORetryableError struct {
	err error
}

func (e eveSSORetryableError) Error() string { return e.err.Error() }
func (e eveSSORetryableError) Unwrap() error { return e.err }
