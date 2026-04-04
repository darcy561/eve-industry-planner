package v1endpoints

import (
	"crypto/sha256"
	"fmt"
	"net/http"
	"sync"
	"time"

	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/shared/logs"
	"eve-industry-planner/shared/shared/metrics"
)

var (
	// Cached JWKS response to reduce computation and I/O
	jwksCache      []byte
	jwksETag       string // ETag based on key ID for cache validation
	jwksCacheKeyID string // Track key ID to detect key rotation
	jwksCacheTime  time.Time
	jwksCacheMu    sync.RWMutex
	jwksCacheTTL   = 1 * time.Hour // Cache for 1 hour (key rarely changes)
)

// InvalidateJWKSCache clears the JWKS cache
// Note: Key rotation is automatically detected by comparing key IDs on each request,
// so this function is mainly for manual cache clearing if needed
func InvalidateJWKSCache() {
	jwksCacheMu.Lock()
	defer jwksCacheMu.Unlock()
	jwksCache = nil
	jwksETag = ""
	jwksCacheKeyID = ""
	jwksCacheTime = time.Time{}
}

// JWKSHandler returns the public key in JWKS format for clients to verify JWT tokens
// This endpoint exposes the public key so end users can verify their tokens
// Response is cached to reduce queries and computation
func JWKSHandler(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	m := metrics.GetAPIAuthJWKS()

	// Load the private key first to get current key ID
	// Loading priority: 1) Persistent file, 2) Environment variable, 3) Auto-generate new key
	cachedKey, err := auth.GetOrLoadPrivateKey()
	if err != nil {
		m.Errors.WithLabelValues("key_load_error").Inc()
		logs.ErrorCtx(r.Context(), "failed to load private key for JWKS", "error", err, "ip", r.RemoteAddr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Check cache first
	jwksCacheMu.RLock()
	cachedJWKS := jwksCache
	cachedETag := jwksETag
	cachedKeyID := jwksCacheKeyID
	cachedTime := jwksCacheTime
	jwksCacheMu.RUnlock()

	// Check if cache is valid (not expired AND key ID matches)
	now := time.Now()
	if cachedJWKS != nil && !cachedTime.IsZero() && cachedKeyID == cachedKey.Kid && now.Sub(cachedTime) < jwksCacheTTL {
		// Check If-None-Match header for conditional requests (304 Not Modified)
		if r.Header.Get("If-None-Match") == cachedETag {
			w.Header().Set("ETag", cachedETag)
			w.WriteHeader(http.StatusNotModified)

			// Update metrics for not modified response
			duration := time.Since(start)
			m.Requests.Observe(duration.Seconds())
			m.RequestsCount.Inc()
			return
		}

		// Return cached response
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "public, max-age=3600") // 1 hour
		w.Header().Set("ETag", cachedETag)
		w.WriteHeader(http.StatusOK)
		w.Write(cachedJWKS)

		// Update metrics for cached response
		duration := time.Since(start)
		m.Requests.Observe(duration.Seconds())
		m.RequestsCount.Inc()
		return
	}

	// Cache expired or key rotated, regenerate
	// Generate JWKS response
	jwks, err := auth.GenerateRS256JWKS(cachedKey.Key, cachedKey.Kid)
	if err != nil {
		m.Errors.WithLabelValues("jwks_generation_error").Inc()
		logs.ErrorCtx(r.Context(), "failed to generate JWKS", "error", err, "ip", r.RemoteAddr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Generate ETag based on key ID and content (changes when key rotates)
	etagHash := sha256.Sum256([]byte(fmt.Sprintf("%s-%s", cachedKey.Kid, string(jwks[:min(100, len(jwks))]))))
	etag := fmt.Sprintf(`"%x"`, etagHash[:8]) // Use first 8 bytes of hash for ETag

	// Update cache
	jwksCacheMu.Lock()
	jwksCache = jwks
	jwksETag = etag
	jwksCacheKeyID = cachedKey.Kid // Track key ID to detect rotation
	jwksCacheTime = now
	jwksCacheMu.Unlock()

	// Set cache headers
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=3600") // 1 hour
	w.Header().Set("ETag", etag)
	w.WriteHeader(http.StatusOK)
	w.Write(jwks)

	// Update metrics
	duration := time.Since(start)
	m.Requests.Observe(duration.Seconds())
	m.RequestsCount.Inc()
}

// min returns the minimum of two integers
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
