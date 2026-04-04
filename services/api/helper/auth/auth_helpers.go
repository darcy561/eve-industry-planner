package auth

import (
	"fmt"
	"net/http"
	"strings"

	"eve-industry-planner/api/helper/sso"
	"eve-industry-planner/shared/shared/logs"
)

// Authentication error messages
const (
	ErrMsgUnauthorized     = "Unauthorized"
	ErrMsgTokenExpired     = "Token expired"
	ErrMsgTokenInvalid     = "Invalid token"
	ErrMsgAuthServiceError = "Authentication service error. Please try again later."
	ErrMsgEveTokenExpired  = "EVE token expired"
	ErrMsgEveTokenInvalid  = "Invalid EVE token"
)

// EveTokenValidationResult contains the extracted information from a validated EVE SSO token
type EveTokenValidationResult struct {
	CharacterHash string
	Scopes        []string
	CharacterName string
}

// validateEveTokenAndExtractHash validates an EVE SSO token and extracts relevant information
// Returns character hash, scopes, and character name if valid, or an error if invalid
func ValidateEveTokenAndExtractHash(tokenString, clientID string, ip string) (*EveTokenValidationResult, error) {
	// Validate the EVE SSO token
	claims, err := sso.ValidateEveSSOToken(tokenString, clientID)
	if err != nil {
		logs.Warn("failed to validate EVE SSO token", "error", err, "ip", ip)
		return nil, err
	}

	// Extract character hash (owner field) from EVE SSO claims
	characterHash := claims.Owner
	if characterHash == "" {
		logs.Warn("failed to extract character hash (owner) from token", "subject", claims.Subject, "ip", ip)
		return nil, fmt.Errorf("missing character hash in token")
	}

	return &EveTokenValidationResult{
		CharacterHash: characterHash,
		Scopes:        claims.Scopes,
		CharacterName: claims.Name,
	}, nil
}

// GetAuthErrorMessage returns a minimal error message for internal JWT token validation failures.
// Only distinguishes between expired and invalid tokens to avoid information leakage.
func GetAuthErrorMessage(err error) string {
	if err == nil {
		return ErrMsgUnauthorized
	}

	errStr := strings.ToLower(err.Error())

	// Only check if expired, all other errors are generic "Invalid token"
	if strings.Contains(errStr, "expired") {
		return ErrMsgTokenExpired
	}

	// Internal server errors should still use a service error message
	if strings.Contains(errStr, "failed to load private key") {
		return ErrMsgAuthServiceError
	}

	return ErrMsgTokenInvalid
}

// GetEveTokenErrorMessage returns a minimal error message for EVE SSO token validation failures.
// Only distinguishes between expired and invalid tokens to avoid information leakage.
func GetEveTokenErrorMessage(err error) string {
	if err == nil {
		return ErrMsgUnauthorized
	}

	errStr := strings.ToLower(err.Error())

	// Only check if expired, all other errors are generic "Invalid EVE token"
	if strings.Contains(errStr, "expired") {
		return ErrMsgEveTokenExpired
	}

	return ErrMsgEveTokenInvalid
}

// ExtractAccountID extracts accountID from the JWT token in Authorization header
func ExtractAccountID(r *http.Request) (string, error) {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return "", fmt.Errorf("missing Authorization header")
	}

	const bearerPrefix = "Bearer "
	if !strings.HasPrefix(authHeader, bearerPrefix) {
		return "", fmt.Errorf("invalid Authorization header format")
	}

	tokenString := strings.TrimSpace(authHeader[len(bearerPrefix):])
	if tokenString == "" {
		return "", fmt.Errorf("empty token")
	}

	claims, err := ValidateInternalJWT(tokenString)
	if err != nil {
		return "", fmt.Errorf("invalid token: %w", err)
	}

	return claims.AccountID, nil
}
