package sso

import "eve-industry-planner/shared/evesso"

// extractCharacterHashFromEveSSOAccessToken validates an access token and
// returns the owner hash, which is the only claim the SSO routes act on.
func extractCharacterHashFromEveSSOAccessToken(tokenString, clientID string) (string, error) {
	validatedClaims, err := evesso.ValidateEveSSOToken(tokenString, clientID)
	if err != nil {
		return "", err
	}
	return validatedClaims.Owner, nil
}
