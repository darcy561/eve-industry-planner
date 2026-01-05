package sso

import (
	"errors"
	"fmt"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

// ValidateEveSSOToken validates an EVE SSO JWT token according to the EVE SSO documentation.
// It verifies the token signature, issuer, audience, and expiration.
// Returns the parsed claims including character ID if valid.
func ValidateEveSSOToken(tokenString, clientID string) (*EveSSOClaims, error) {
	if clientID == "" {
		return nil, errors.New("EVE SSO client ID not configured")
	}

	// Fetch JWKS metadata (cached)
	keys, err := fetchJWKSKeys()
	if err != nil {
		return nil, fmt.Errorf("failed to fetch JWKS keys: %w", err)
	}

	// Parse token header to get key ID
	token, err := jwt.ParseWithClaims(tokenString, &EveSSOClaims{}, func(token *jwt.Token) (interface{}, error) {
		// Verify signing method
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}

		// Get key ID from header
		kid, ok := token.Header["kid"].(string)
		if !ok {
			return nil, errors.New("missing kid in token header")
		}

		// Find the matching key
		publicKey, err := findKeyByKid(keys, kid)
		if err != nil {
			return nil, fmt.Errorf("failed to find key: %w", err)
		}

		return publicKey, nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to parse token: %w", err)
	}

	claims, ok := token.Claims.(*EveSSOClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token claims")
	}

	// Validate issuer
	// EVE SSO may use any of these formats:
	// - https://login.eveonline.com/ (with trailing slash)
	// - https://login.eveonline.com (without trailing slash)
	// - login.eveonline.com (without protocol)
	if claims.Issuer != eveSSOIssuer1 && claims.Issuer != eveSSOIssuer2 && claims.Issuer != eveSSOIssuer3 {
		return nil, fmt.Errorf("invalid issuer: %s", claims.Issuer)
	}

	// Validate audience
	// According to EVE SSO docs, audience should contain BOTH "EVE Online" AND the client_id
	hasEveAudience := false
	hasClientID := false
	for _, aud := range claims.Audience {
		if aud == eveSSOAudience {
			hasEveAudience = true
		}
		if aud == clientID {
			hasClientID = true
		}
	}
	if !hasEveAudience || !hasClientID {
		return nil, fmt.Errorf("invalid audience: must contain both '%s' and client ID '%s'", eveSSOAudience, clientID)
	}

	// Extract character ID from subject
	claims.CharacterID = ExtractCharacterID(claims.Subject)

	return claims, nil
}

// ExtractCharacterID extracts the character ID from the subject claim.
// Format: CHARACTER:EVE:<character-id> or EVE:CHARACTER:<character-id>
func ExtractCharacterID(subject string) string {
	parts := strings.Split(subject, ":")
	if len(parts) == 3 {
		// EVE SSO uses CHARACTER:EVE:<character-id>
		if parts[0] == "CHARACTER" && parts[1] == "EVE" {
			return parts[2]
		}
		// Also support legacy format EVE:CHARACTER:<character-id>
		if parts[0] == "EVE" && parts[1] == "CHARACTER" {
			return parts[2]
		}
	}
	return ""
}
