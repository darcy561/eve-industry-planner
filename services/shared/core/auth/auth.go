package auth

import (
	"errors"
	"time"

	"eve-industry-planner/shared/core/config"

	"github.com/golang-jwt/jwt/v5"
)

type Authenticator struct {
	signingKey       []byte
	externalKey      []byte
	expectedIssuer   string
	expectedAudience string
}

func NewAuthenticator(cfg config.Config) *Authenticator {
	return &Authenticator{
		signingKey:       []byte(cfg.AuthSecret),
		externalKey:      []byte(cfg.ExternalJWTSecret),
		expectedIssuer:   cfg.ExternalJWTIssuer,
		expectedAudience: cfg.ExternalJWTAudience,
	}
}

type UserClaims struct {
	UserID   string   `json:"user_id"`
	Username string   `json:"username"`
	Roles    []string `json:"roles"`
	jwt.RegisteredClaims
}

// ExternalClaims models a minimal set of fields expected from the third-party SSO JWT.
type ExternalClaims struct {
	Subject string `json:"sub"`
	Name    string `json:"name"`
	Email   string `json:"email"`
	jwt.RegisteredClaims
}

// ValidateExternalToken verifies the incoming SSO JWT using the configured external key
// and optional issuer/audience checks. Returns the parsed claims on success.
func (a *Authenticator) ValidateExternalToken(tokenString string) (*ExternalClaims, error) {
	parsedToken, err := jwt.ParseWithClaims(tokenString, &ExternalClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method for external token")
		}
		return a.externalKey, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := parsedToken.Claims.(*ExternalClaims)
	if !ok || !parsedToken.Valid {
		return nil, errors.New("invalid external token")
	}
	// Optional issuer/audience checks when configured
	if a.expectedIssuer != "" && claims.Issuer != a.expectedIssuer {
		return nil, errors.New("unexpected external token issuer")
	}
	if a.expectedAudience != "" {
		if len(claims.Audience) == 0 {
			return nil, errors.New("unexpected external token audience")
		}
		okAud := false
		for _, aud := range claims.Audience {
			if aud == a.expectedAudience {
				okAud = true
				break
			}
		}
		if !okAud {
			return nil, errors.New("unexpected external token audience")
		}
	}
	return claims, nil
}

// ExchangeToken validates an external SSO JWT and issues an internal JWT used by this backend.
// The internal token uses our signing key and includes mapped user identity fields.
func (a *Authenticator) ExchangeToken(externalToken string, ttl time.Duration) (string, *UserClaims, error) {
	ext, err := a.ValidateExternalToken(externalToken)
	if err != nil {
		return "", nil, err
	}
	userID := ext.Subject
	username := ext.Name
	if username == "" {
		username = ext.Email
	}
	now := time.Now()
	internal := UserClaims{
		UserID:   userID,
		Username: username,
		Roles:    []string{},
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, internal)
	signed, err := token.SignedString(a.signingKey)
	if err != nil {
		return "", nil, err
	}
	return signed, &internal, nil
}
