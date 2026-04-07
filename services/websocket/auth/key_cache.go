package auth

import (
	"context"
	"crypto/rsa"
	"sync"

	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/logs"
)

// CachedPrivateKey holds a cached RSA private key with its associated key ID
type CachedPrivateKey struct {
	Key *rsa.PrivateKey
	Kid string
}

var (
	privateKeyCache   *CachedPrivateKey
	privateKeyCacheMu sync.RWMutex
)

// GetOrLoadPrivateKey loads and caches the RSA private key for JWT signing
// Thread-safe: can be called concurrently
// Auto-generates key if not found (saves to DefaultAutoGeneratePath)
func GetOrLoadPrivateKey() (*CachedPrivateKey, error) {
	privateKeyCacheMu.RLock()
	if privateKeyCache != nil {
		cached := privateKeyCache
		privateKeyCacheMu.RUnlock()
		return cached, nil
	}
	privateKeyCacheMu.RUnlock()

	// Load the key
	privateKeyCacheMu.Lock()
	defer privateKeyCacheMu.Unlock()

	// Double-check after acquiring write lock
	if privateKeyCache != nil {
		return privateKeyCache, nil
	}

	cfg, err := config.LoadConfig()
	if err != nil {
		return nil, err
	}
	key, err := LoadRSAPrivateKey()
	if err != nil {
		return nil, err
	}

	// Load key ID using same priority logic as private key (file > env > generate)
	keyID, err := LoadKeyID(cfg)
	if err != nil {
		// Fallback to config default if LoadKeyID fails
		logs.WarnCtx(context.Background(), "Failed to load key ID, using config default", "error", err)
		keyID = cfg.JWTKeyID
	}

	privateKeyCache = &CachedPrivateKey{
		Key: key,
		Kid: keyID,
	}

	return privateKeyCache, nil
}
