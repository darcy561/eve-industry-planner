package sso

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"time"
)

// fetchJWKSKeys fetches and caches JWKS keys from EVE SSO
// JWKS (JSON Web Key Set) contains the public keys needed to verify JWT signatures.
// We cache the converted RSA public keys to avoid:
// 1. Repeated HTTP calls to EVE SSO endpoints
// 2. Repeated conversion from JWK format to Go's rsa.PublicKey format
// The cache TTL is 5 minutes since JWKS keys rarely change
func fetchJWKSKeys() (map[string]*rsa.PublicKey, error) {
	jwksCacheMu.RLock()
	if jwksCache != nil && time.Since(jwksCacheTime) < jwksCacheTTL {
		keys := jwksCache.Keys
		jwksCacheMu.RUnlock()
		return convertJWKsToRSAPublicKeys(keys)
	}
	jwksCacheMu.RUnlock()

	jwksCacheMu.Lock()
	defer jwksCacheMu.Unlock()

	// Double-check after acquiring write lock
	if jwksCache != nil && time.Since(jwksCacheTime) < jwksCacheTTL {
		keys := jwksCache.Keys
		return convertJWKsToRSAPublicKeys(keys)
	}

	// Fetch metadata to get JWKS URL
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	metadataReq, err := http.NewRequestWithContext(ctx, http.MethodGet, eveSSOMetadataURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create metadata request: %w", err)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	metadataResp, err := client.Do(metadataReq)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch metadata: %w", err)
	}
	defer metadataResp.Body.Close()

	if metadataResp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code from metadata endpoint: %d", metadataResp.StatusCode)
	}

	var metadata struct {
		JWKSUri string `json:"jwks_uri"`
	}
	if err := json.NewDecoder(metadataResp.Body).Decode(&metadata); err != nil {
		return nil, fmt.Errorf("failed to decode metadata: %w", err)
	}

	if metadata.JWKSUri == "" {
		return nil, errors.New("JWKS URI not found in metadata")
	}

	// Fetch JWKS
	jwksReq, err := http.NewRequestWithContext(ctx, http.MethodGet, metadata.JWKSUri, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create JWKS request: %w", err)
	}

	jwksResp, err := client.Do(jwksReq)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch JWKS: %w", err)
	}
	defer jwksResp.Body.Close()

	if jwksResp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code from JWKS endpoint: %d", jwksResp.StatusCode)
	}

	var jwks JWKSet
	if err := json.NewDecoder(jwksResp.Body).Decode(&jwks); err != nil {
		return nil, fmt.Errorf("failed to decode JWKS: %w", err)
	}

	// Update cache
	jwksCache = &jwks
	jwksCacheTime = time.Now()

	return convertJWKsToRSAPublicKeys(jwks.Keys)
}

// convertJWKsToRSAPublicKeys converts JWK format to Go's rsa.PublicKey
// EVE SSO provides keys in JWK (JSON Web Key) format with base64-encoded modulus (n) and exponent (e).
// This function decodes and converts them to Go's native RSA public key structure for signature verification.
func convertJWKsToRSAPublicKeys(jwks []JWK) (map[string]*rsa.PublicKey, error) {
	keys := make(map[string]*rsa.PublicKey)

	for _, jwk := range jwks {
		if jwk.Kty != "RSA" {
			continue
		}

		// Decode modulus (n)
		nBytes, err := base64.RawURLEncoding.DecodeString(jwk.N)
		if err != nil {
			return nil, fmt.Errorf("failed to decode modulus for key %s: %w", jwk.Kid, err)
		}

		// Decode exponent (e)
		eBytes, err := base64.RawURLEncoding.DecodeString(jwk.E)
		if err != nil {
			return nil, fmt.Errorf("failed to decode exponent for key %s: %w", jwk.Kid, err)
		}

		// Convert exponent bytes to int
		// RSA exponents are typically small (65537), so this should be safe
		var eInt int
		if len(eBytes) == 0 {
			return nil, fmt.Errorf("empty exponent for key %s", jwk.Kid)
		}
		for _, b := range eBytes {
			eInt = eInt<<8 | int(b)
		}
		if eInt == 0 {
			return nil, fmt.Errorf("invalid exponent for key %s", jwk.Kid)
		}

		// Create RSA public key
		publicKey := &rsa.PublicKey{
			N: new(big.Int).SetBytes(nBytes),
			E: eInt,
		}

		keys[jwk.Kid] = publicKey
	}

	return keys, nil
}

// findKeyByKid finds an RSA public key by key ID
func findKeyByKid(keys map[string]*rsa.PublicKey, kid string) (*rsa.PublicKey, error) {
	key, ok := keys[kid]
	if !ok {
		return nil, fmt.Errorf("key with kid '%s' not found", kid)
	}
	return key, nil
}

