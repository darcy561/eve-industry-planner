package evesso

const (
	MaxAuthCodeLength     = 512
	MaxRefreshTokenLength = 512
	// EveSSOTokenURL is the CCP OAuth token endpoint.
	EveSSOTokenURL = "https://login.eveonline.com/v2/oauth/token"
)

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
