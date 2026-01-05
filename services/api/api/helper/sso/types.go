package sso

import (
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	eveSSOMetadataURL = "https://login.eveonline.com/.well-known/oauth-authorization-server"
	eveSSOIssuer1     = "https://login.eveonline.com/"
	eveSSOIssuer2     = "https://login.eveonline.com"
	eveSSOIssuer3     = "login.eveonline.com"
	eveSSOAudience    = "EVE Online"
	jwksCacheTTL      = 5 * time.Minute
)

var (
	jwksCache     *JWKSet
	jwksCacheTime time.Time
	jwksCacheMu   sync.RWMutex
)

// JWKSet represents the JSON Web Key Set structure
type JWKSet struct {
	Keys []JWK `json:"keys"`
}

// JWK represents a single JSON Web Key
type JWK struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Use string `json:"use"`
	Alg string `json:"alg"`
	N   string `json:"n"`
	E   string `json:"e"`
}

// EveSSOClaims represents the claims in an EVE SSO JWT token
type EveSSOClaims struct {
	Subject     string   `json:"sub"`
	Name        string   `json:"name"`
	Owner       string   `json:"owner"` // Character hash (base64 encoded identifier)
	Scopes      []string `json:"scp"`
	CharacterID string
	jwt.RegisteredClaims
}
