package auth

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"eve-industry-planner/api/helper/sso"
	"eve-industry-planner/shared/core/internaljwt"
	"eve-industry-planner/shared/logs"

	"github.com/redis/go-redis/v9"
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

// ValidateEveTokenAndExtractHash validates an EVE SSO token and extracts relevant information.
// Returns character hash, scopes, and character name if valid, or an error if invalid.
func ValidateEveTokenAndExtractHash(ctx context.Context, tokenString, clientID string) (*EveTokenValidationResult, error) {
	// Validate the EVE SSO token
	claims, err := sso.ValidateEveSSOToken(tokenString, clientID)
	if err != nil {
		return nil, err
	}

	// Extract character hash (owner field) from EVE SSO claims
	characterHash := claims.Owner
	if characterHash == "" {
		logs.WarnCtx(ctx, "failed to extract character hash (owner) from token", "subject", claims.Subject)
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
	claims, err := ExtractInternalClaims(r)
	if err != nil {
		return "", err
	}
	return claims.AccountID, nil
}

// ExtractSessionID extracts sessionID from the validated internal JWT in Authorization header.
func ExtractSessionID(r *http.Request) (string, error) {
	claims, err := ExtractInternalClaims(r)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(claims.SessionID) == "" {
		return "", fmt.Errorf("missing session_id claim")
	}
	return claims.SessionID, nil
}

// ExtractInternalClaims validates the bearer token and returns parsed internal claims.
func ExtractInternalClaims(r *http.Request) (*internaljwt.InternalClaims, error) {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return nil, fmt.Errorf("missing Authorization header")
	}

	const bearerPrefix = "Bearer "
	if !strings.HasPrefix(authHeader, bearerPrefix) {
		return nil, fmt.Errorf("invalid Authorization header format")
	}

	tokenString := strings.TrimSpace(authHeader[len(bearerPrefix):])
	if tokenString == "" {
		return nil, fmt.Errorf("empty token")
	}

	claims, err := internaljwt.ValidateInternalJWT(tokenString)
	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}
	return claims, nil
}

// sessionIDHTTPHeader must match api/helper.SessionIDHeader ("X-Session-ID").
func sessionIDFromRequestHeader(r *http.Request) string {
	if r == nil {
		return ""
	}
	return strings.TrimSpace(r.Header.Get("X-Session-ID"))
}

// SessionHeaderMatchesJWTClaims reports whether X-Session-ID matches the JWT session_id claim.
// Both values must be non-empty after trim (binding JWT to the caller-declared session).
func SessionHeaderMatchesJWTClaims(r *http.Request, claims *internaljwt.InternalClaims) bool {
	if claims == nil {
		return false
	}
	want := strings.TrimSpace(claims.SessionID)
	if want == "" {
		return false
	}
	got := sessionIDFromRequestHeader(r)
	return got != "" && got == want
}

// SessionUpgradeMatchesJWTClaims reports whether the upgrade request carries the same session id as the JWT:
// prefers X-Session-ID when set; otherwise URL query session_id (browser WebSockets cannot set custom headers).
func SessionUpgradeMatchesJWTClaims(r *http.Request, claims *internaljwt.InternalClaims) bool {
	if claims == nil || r == nil {
		return false
	}
	want := strings.TrimSpace(claims.SessionID)
	if want == "" {
		return false
	}
	if got := sessionIDFromRequestHeader(r); got != "" {
		return got == want
	}
	got := strings.TrimSpace(r.URL.Query().Get("session_id"))
	return got != "" && got == want
}

// SessionRedisMatchesJWTClaims reports whether Redis session:<session_id> exists, its session_id
// matches the JWT claim, and its account_id matches the JWT account_id claim.
func SessionRedisMatchesJWTClaims(ctx context.Context, redisClient *redis.Client, claims *internaljwt.InternalClaims) bool {
	if claims == nil || redisClient == nil {
		return false
	}
	jwtAccount := strings.TrimSpace(claims.AccountID)
	sid := strings.TrimSpace(claims.SessionID)
	if jwtAccount == "" || sid == "" {
		return false
	}
	rec, err := GetSessionRecord(ctx, redisClient, sid)
	if err != nil || rec == nil {
		return false
	}
	if strings.TrimSpace(rec.SessionID) != sid {
		return false
	}
	return strings.TrimSpace(rec.AccountID) == jwtAccount
}

// BearerInternalJWTValid reports whether the request carries a valid internal JWT, the
// X-Session-ID header matches the JWT session_id claim, and Redis session record account_id
// matches the JWT (same binding as private-route middleware).
func BearerInternalJWTValid(ctx context.Context, r *http.Request, redisClient *redis.Client) bool {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return false
	}

	const bearerPrefix = "Bearer "
	if !strings.HasPrefix(authHeader, bearerPrefix) {
		return false
	}

	tokenString := strings.TrimSpace(authHeader[len(bearerPrefix):])
	if tokenString == "" {
		return false
	}

	claims, err := internaljwt.ValidateInternalJWT(tokenString)
	if err != nil {
		return false
	}
	if !SessionHeaderMatchesJWTClaims(r, claims) {
		return false
	}
	return SessionRedisMatchesJWTClaims(ctx, redisClient, claims)
}
