package auth

import (
	"crypto/rsa"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// TokenExpirationDuration is the duration for which internal JWT tokens are valid
const TokenExpirationDuration = 20 * time.Minute

// CorporationIDs is a custom type that unmarshals to []int64, or empty slice on error
type CorporationIDs []int64

// UnmarshalJSON implements custom JSON unmarshaling
// If unmarshaling fails (e.g., old tokens with strings), returns empty slice
func (c *CorporationIDs) UnmarshalJSON(data []byte) error {
	var ints []int64
	if err := json.Unmarshal(data, &ints); err != nil {
		// If unmarshaling fails (e.g., old format with strings), just use empty slice
		*c = CorporationIDs{}
		return nil
	}
	*c = CorporationIDs(ints)
	return nil
}

// InternalClaims represents the claims for our internal JWT tokens
type InternalClaims struct {
	CharacterHash string         `json:"character_hash"` // Character hash from EVE SSO (base64 encoded)
	AccountID     string         `json:"account_id"`
	Corporations  CorporationIDs `json:"corporations"` // Corporation IDs the user can access (always present, empty array if none)
	jwt.RegisteredClaims
}

// GenerateInternalJWT creates a new internal JWT token signed with RSA private key (RS256)
// The token includes character information and expires after the specified duration
// Uses RS256 so clients can verify tokens with the public key (JWKS endpoint)
// Corporations can be optionally provided to include them in the token claims
func GenerateInternalJWT(privateKey *rsa.PrivateKey, characterHash string, kid string, corporations ...[]int64) (string, *InternalClaims, error) {
	if privateKey == nil {
		return "", nil, errors.New("private key cannot be nil")
	}
	if characterHash == "" {
		return "", nil, errors.New("character hash cannot be empty")
	}

	now := time.Now()
	// Extract only alphanumeric characters from character hash for AccountID
	// This removes base64 padding characters (=, /, +), spaces, and other non-alphanumeric chars
	alphanumericRegex := regexp.MustCompile(`[^a-zA-Z0-9]`)
	accountID := alphanumericRegex.ReplaceAllString(characterHash, "")

	// Use provided corporations or default to empty slice
	corpIDs := CorporationIDs{}
	if len(corporations) > 0 && corporations[0] != nil {
		corpIDs = CorporationIDs(corporations[0])
	}

	claims := &InternalClaims{
		CharacterHash: characterHash,
		AccountID:     accountID,
		Corporations:  corpIDs,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(TokenExpirationDuration)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	if kid != "" {
		token.Header["kid"] = kid
	}
	tokenString, err := token.SignedString(privateKey)
	if err != nil {
		return "", nil, fmt.Errorf("failed to sign token: %w", err)
	}

	return tokenString, claims, nil
}

// ValidateInternalJWT validates an internal JWT token and returns its claims
// Uses the public key from the private key to verify the signature (RS256)
func ValidateInternalJWT(tokenString string) (*InternalClaims, error) {
	// Load the private key to get the public key
	cachedKey, err := GetOrLoadPrivateKey()
	if err != nil {
		return nil, fmt.Errorf("failed to load private key: %w", err)
	}

	// Parse token with public key verification
	// jwt.ParseWithClaims automatically validates expiration (ExpiresAt),
	// NotBefore, and IssuedAt claims via RegisteredClaims
	token, err := jwt.ParseWithClaims(tokenString, &InternalClaims{}, func(token *jwt.Token) (interface{}, error) {
		// Verify signing method
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}

		// Return public key for verification
		return &cachedKey.Key.PublicKey, nil
	})

	if err != nil {
		// jwt.ParseWithClaims validates expiration automatically
		// If token is expired, this will return an error
		return nil, fmt.Errorf("failed to parse token: %w", err)
	}

	claims, ok := token.Claims.(*InternalClaims)
	if !ok {
		return nil, errors.New("invalid token claims type")
	}

	// token.Valid is false if token is expired or signature is invalid
	// jwt.ParseWithClaims automatically validates ExpiresAt, NotBefore, and IssuedAt
	// via RegisteredClaims.Valid() method
	if !token.Valid {
		// Explicitly check if token is expired for better error message
		if claims.ExpiresAt != nil && claims.ExpiresAt.Time.Before(time.Now()) {
			return nil, errors.New("token expired")
		}
		return nil, errors.New("invalid token")
	}

	return claims, nil
}
