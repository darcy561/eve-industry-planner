// Package helper derives deterministic entity refs from raw EVE ids.
//
// Refs let authorization state reference a character, corporation, or alliance
// without persisting the raw id. The same (kind, id, key version) always yields
// the same ref, so refs stay comparable across services while the key holds.
package helper

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"os"
	"strings"

	"eve-industry-planner/shared/core/swarmsecret"
)

// DefaultKeyVersion is used when AUTHZ_HMAC_KEY_VERSION is unset.
const DefaultKeyVersion = "v1"

// minKeyBytes is the shortest key accepted for HMAC-SHA256 derivation.
const minKeyBytes = 16

// Helper derives refs under one key version.
type Helper struct {
	version string
	key     []byte
}

// New builds a Helper from an explicit key version and key material.
func New(version string, key []byte) (*Helper, error) {
	version = strings.TrimSpace(version)
	if version == "" {
		version = DefaultKeyVersion
	}
	if len(key) < minKeyBytes {
		return nil, fmt.Errorf("authz hmac key must be at least %d bytes", minKeyBytes)
	}
	return &Helper{
		version: version,
		key:     append([]byte(nil), key...),
	}, nil
}

// NewFromEnv builds a Helper from AUTHZ_HMAC_KEY and AUTHZ_HMAC_KEY_VERSION.
// The key resolves from env or /run/secrets (see [swarmsecret.Require]).
func NewFromEnv() (*Helper, error) {
	key, err := swarmsecret.Require("AUTHZ_HMAC_KEY")
	if err != nil {
		return nil, err
	}
	version := strings.TrimSpace(os.Getenv("AUTHZ_HMAC_KEY_VERSION"))
	return New(version, []byte(strings.TrimSpace(key)))
}

// Version reports the key version stamped into every ref this Helper derives.
func (h *Helper) Version() string {
	if h == nil {
		return ""
	}
	return h.version
}

// RefFromCharacterID derives the ref for an EVE character id.
func (h *Helper) RefFromCharacterID(id int64) (string, error) {
	return h.refFromID("char", id)
}

// RefFromCorporationID derives the ref for an EVE corporation id.
func (h *Helper) RefFromCorporationID(id int64) (string, error) {
	return h.refFromID("corp", id)
}

// RefFromAllianceID derives the ref for an EVE alliance id.
func (h *Helper) RefFromAllianceID(id int64) (string, error) {
	return h.refFromID("alliance", id)
}

// refFromID derives "{version}_{kind}_{token}". The kind is part of the HMAC
// input so the same numeric id cannot collide across entity kinds.
func (h *Helper) refFromID(kind string, id int64) (string, error) {
	if h == nil {
		return "", fmt.Errorf("authzhmac helper is nil")
	}
	if id <= 0 {
		return "", fmt.Errorf("id must be > 0")
	}
	mac := hmac.New(sha256.New, h.key)
	fmt.Fprintf(mac, "%s:%d", kind, id)
	token := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return h.version + "_" + kind + "_" + token, nil
}
