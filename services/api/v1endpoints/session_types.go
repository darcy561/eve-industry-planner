package v1endpoints

import (
	"context"
	"time"

	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/api/marketsources"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	eipredis "eve-industry-planner/shared/redis"
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
	Kind                string                     `json:"kind"`
	EsiOAuthStorage     string                     `json:"esi_oauth_storage"`
	AccountID           string                     `json:"account_id"`
	SessionID           string                     `json:"session_id"`
	MainCharacterHash   string                     `json:"main_character_hash,omitempty"`
	RefreshToken        string                     `json:"refresh_token,omitempty"`
	ReauthRequiredAt    int64                      `json:"reauth_required_at"`
	FirstLogin          bool                       `json:"first_login,omitzero"`
	UserDocument        models.UserAccountDocument `json:"user_document"`
	ApplicationSettings models.ApplicationSettings `json:"application_settings"`
	// Beside the settings document, never inside it: that document goes back to
	// the server on save, and this is composed from several owners.
	//
	// Absent rather than empty where it could not be composed, so a client can
	// tell "you have no markets" from "ask again" — an account that really has
	// none carries `[]`.
	//
	// `omitzero`, never `omitempty`: this codec follows a pointer, so omitempty
	// drops a composed-but-empty union as readily as an absent one and collapses
	// the two states this field exists to keep apart.
	MarketLocations  *models.MarketLocations         `json:"market_locations,omitzero"`
	LinkedCharacters []models.LinkedCharacterSession `json:"linked_characters,omitempty"`
}

func esiOAuthStorageFromUserCloud(userCloudAccounts bool) string {
	if userCloudAccounts {
		return auth.EsiOAuthStorageServer
	}
	return auth.EsiOAuthStorageClient
}

// marketLocationsForSession is what an account may price against, for a
// bootstrap to carry so a first load does not ask for it separately.
//
// A failure here is not a failed login. The markets are a convenience on this
// response — the client reads them from `/api/v1/user/market-locations`
// otherwise — and login builds the ESI data the planner needs, so it must not
// fall over for something a later request can fetch.
func marketLocationsForSession(ctx context.Context, m *eipmongo.Mongo, redis *eipredis.Redis, accountID string) *models.MarketLocations {
	if m == nil || accountID == "" {
		return nil
	}

	composed, err := m.MarketLocationsForAccount(ctx, accountID, time.Now().UTC())
	if err != nil {
		logs.WarnCtx(ctx, "session bootstrap: market locations not composed",
			"account_id", accountID, "error", err)
		return nil
	}

	stamped := marketsources.StampPricedAt(ctx, redis, composed)
	return &stamped
}
