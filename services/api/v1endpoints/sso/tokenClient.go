package sso

import (
	"context"

	ssohelper "eve-industry-planner/api/helper/sso"
	evesso "eve-industry-planner/shared/core/evesso"
)

func exchangeAuthCodeForEveSSOTokens(ctx context.Context, clientID, clientSecret, authCode string) (*EveSSOTokenPayload, error) {
	return evesso.ExchangeAuthCodeForEveSSOTokens(ctx, clientID, clientSecret, authCode)
}

// RefreshEveSSOAccessToken exchanges an EVE SSO refresh_token grant at login.eveonline.com.
func RefreshEveSSOAccessToken(ctx context.Context, clientID, clientSecret, refreshToken string) (*EveSSOTokenPayload, error) {
	return evesso.RefreshEveSSOAccessToken(ctx, clientID, clientSecret, refreshToken)
}

func extractCharacterHashFromEveSSOAccessToken(tokenString, clientID string) (string, error) {
	validatedClaims, err := ssohelper.ValidateEveSSOToken(tokenString, clientID)
	if err != nil {
		return "", err
	}
	return validatedClaims.Owner, nil
}
