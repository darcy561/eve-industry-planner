package v1endpoints

import (
	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/shared/models"
)

const (
	sessionKindRotate    = "session_rotate"
	sessionKindBootstrap = "session_bootstrap"
)

// SessionRotateResponse is returned by POST /api/v1/auth/sessions/rotate only (periodic session rotation).
type SessionRotateResponse struct {
	Kind              string `json:"kind"`
	AccountID         string `json:"account_id"`
	SessionID         string `json:"session_id"`
	MainCharacterHash string `json:"main_character_hash,omitempty"`
	RefreshToken      string `json:"refresh_token,omitempty"`
	ReauthRequiredAt  int64  `json:"reauth_required_at"`
}

// SessionBootstrapResponse is returned by POST /api/v1/auth/sessions/bootstrap and POST /api/v1/auth/sessions (initial login).
type SessionBootstrapResponse struct {
	Kind                string                          `json:"kind"`
	EsiOAuthStorage     string                          `json:"esi_oauth_storage"`
	AccountID           string                          `json:"account_id"`
	SessionID           string                          `json:"session_id"`
	MainCharacterHash   string                          `json:"main_character_hash,omitempty"`
	RefreshToken        string                          `json:"refresh_token,omitempty"`
	ReauthRequiredAt    int64                           `json:"reauth_required_at"`
	FirstLogin          bool                            `json:"first_login,omitempty"`
	UserDocument        models.UserAccountDocument      `json:"user_document,omitempty"`
	ApplicationSettings models.ApplicationSettings      `json:"application_settings,omitempty"`
	LinkedCharacters    []models.LinkedCharacterSession `json:"linked_characters,omitempty"`
}

func esiOAuthStorageFromUserCloud(userCloudAccounts bool) string {
	if userCloudAccounts {
		return auth.EsiOAuthStorageServer
	}
	return auth.EsiOAuthStorageClient
}
