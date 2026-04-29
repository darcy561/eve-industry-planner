package sso

const (
	maxAuthCodeLength     = 512 // Maximum authorization code length
	maxRefreshTokenLength = 512
	eveSSOTokenURL        = "https://login.eveonline.com/v2/oauth/token"
)

type EveSSOExchangeRequest struct {
	AuthCode    string `json:"auth_code"`
	AccountType bool   `json:"account_type,omitempty"`
}

type EveSSOTokenPayload struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
}

type EveSSORefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type EveSSOErrorResponse struct {
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description"`
}

type eveSSORetryableError struct {
	err error
}

func (e eveSSORetryableError) Error() string { return e.err.Error() }
func (e eveSSORetryableError) Unwrap() error { return e.err }
