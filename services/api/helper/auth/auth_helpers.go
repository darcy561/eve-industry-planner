package auth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"eve-industry-planner/api/helper/sso"
	"eve-industry-planner/shared/logs"

	"github.com/redis/go-redis/v9"
)

type requestContextKey string

const (
	accountIDContextKey requestContextKey = "auth.account_id"
	sessionIDContextKey requestContextKey = "auth.session_id"
)

type AccountSessionIdentity struct {
	AccountID string
	SessionID string
	Session   AccountSession
}

func WithAuthIdentity(ctx context.Context, accountID, sessionID string) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	ctx = context.WithValue(ctx, accountIDContextKey, strings.TrimSpace(accountID))
	ctx = context.WithValue(ctx, sessionIDContextKey, strings.TrimSpace(sessionID))
	return ctx
}

func AccountIDFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	v, _ := ctx.Value(accountIDContextKey).(string)
	return strings.TrimSpace(v)
}

func SessionIDFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	v, _ := ctx.Value(sessionIDContextKey).(string)
	return strings.TrimSpace(v)
}

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

// ExtractAccountID returns accountID set by auth middleware (session identity).
func ExtractAccountID(r *http.Request) (string, error) {
	if r == nil {
		return "", fmt.Errorf("missing request")
	}
	if fromCtx := AccountIDFromContext(r.Context()); fromCtx != "" {
		return fromCtx, nil
	}
	return "", fmt.Errorf("missing auth context")
}

// ExtractSessionID returns sessionID set by auth middleware (session identity).
func ExtractSessionID(r *http.Request) (string, error) {
	if r == nil {
		return "", fmt.Errorf("missing request")
	}
	if fromCtx := SessionIDFromContext(r.Context()); fromCtx != "" {
		return fromCtx, nil
	}
	return "", fmt.Errorf("missing auth context")
}

func ExtractAccountSession(ctx context.Context, r *http.Request, redisClient *redis.Client) (*AccountSessionIdentity, error) {
	if redisClient == nil {
		return nil, errors.New("redis client is nil")
	}
	sessionID := strings.TrimSpace(ReadAppSessionCookie(r))
	if sessionID == "" {
		return nil, &AuthSessionError{
			Code:   "session_missing",
			Reason: authSessionReasonCookieAbsent,
		}
	}
	accountID, session, err := ResolveAccountSessionBySessionID(ctx, redisClient, sessionID)
	if err != nil || session == nil {
		authErr := &AuthSessionError{
			Code:      "session_missing",
			SessionID: sessionID,
			AccountID: strings.TrimSpace(accountID),
		}
		switch {
		case authErr.AccountID != "":
			authErr.Reason = authSessionReasonSessionRowMissing
		case err != nil && err.Error() == "session not found":
			authErr.Reason = authSessionReasonSessionIndexMissing
		default:
			authErr.Reason = authSessionReasonRedisError
		}
		return nil, authErr
	}
	if session.RevokedAt != nil {
		return nil, &AuthSessionError{
			Code:      "session_revoked",
			AccountID: accountID,
			SessionID: sessionID,
		}
	}
	if IsReauthExpired(session.StartedAt, session.ReauthRequiredAt, time.Now().UTC()) {
		return nil, &AuthSessionError{
			Code:      "reauth_required",
			AccountID: accountID,
			SessionID: sessionID,
		}
	}
	return &AccountSessionIdentity{
		AccountID: accountID,
		SessionID: sessionID,
		Session:   *session,
	}, nil
}

func TryExtractAccountSession(ctx context.Context, r *http.Request, redisClient *redis.Client) (*AccountSessionIdentity, bool) {
	identity, err := ExtractAccountSession(ctx, r, redisClient)
	if err != nil || identity == nil {
		return nil, false
	}
	return identity, true
}

func ExtractAccountIDFromSession(ctx context.Context, r *http.Request, redisClient *redis.Client) (string, error) {
	identity, err := ExtractAccountSession(ctx, r, redisClient)
	if err != nil {
		return "", err
	}
	return identity.AccountID, nil
}

func ExtractSessionIDFromSession(ctx context.Context, r *http.Request, redisClient *redis.Client) (string, error) {
	identity, err := ExtractAccountSession(ctx, r, redisClient)
	if err != nil {
		return "", err
	}
	return identity.SessionID, nil
}

func ExtractSessionGrants(ctx context.Context, r *http.Request, redisClient *redis.Client) ([]int64, []int64, error) {
	identity, err := ExtractAccountSession(ctx, r, redisClient)
	if err != nil {
		return nil, nil, err
	}
	return identity.Session.Grants.CorporationIDs, identity.Session.Grants.AllianceIDs, nil
}
