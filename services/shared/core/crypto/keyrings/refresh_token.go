package keyrings

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sort"
	"strings"

	corecrypto "eve-industry-planner/shared/core/crypto"
	"eve-industry-planner/shared/core/swarmsecret"

	"go.mongodb.org/mongo-driver/bson"
)

const (
	// RefreshTokenDefaultKeyVersion is used when REFRESH_TOKEN_AES_KEY_VERSION is unset.
	RefreshTokenDefaultKeyVersion = "v1"
)

// RefreshTokenKeyringSpec contains the keyring and derived version metadata.
type RefreshTokenKeyringSpec struct {
	Keyring           *corecrypto.Keyring
	ActiveVersion     string
	SupportedVersions map[string]struct{}
}

// NewRefreshTokenKeyring builds the refresh-token keyring from environment variables.
func NewRefreshTokenKeyring() (*corecrypto.Keyring, error) {
	spec, err := NewRefreshTokenKeyringSpec()
	if err != nil {
		return nil, err
	}
	return spec.Keyring, nil
}

// NewRefreshTokenKeyringSpec builds refresh-token keyring + key version metadata
// from env or /run/secrets (see [swarmsecret.Require] / [swarmsecret.Get]).
func NewRefreshTokenKeyringSpec() (*RefreshTokenKeyringSpec, error) {
	raw, err := swarmsecret.Require("REFRESH_TOKEN_AES_KEY")
	if err != nil {
		return nil, err
	}
	key, err := decodeAESKey(raw, "REFRESH_TOKEN_AES_KEY")
	if err != nil {
		return nil, err
	}

	ver := strings.TrimSpace(os.Getenv("REFRESH_TOKEN_AES_KEY_VERSION"))
	if ver == "" {
		ver = RefreshTokenDefaultKeyVersion
	}

	legacy, err := parseLegacyRefreshTokenKeys(swarmsecret.Get("REFRESH_TOKEN_AES_LEGACY_KEYS"), len(key), ver)
	if err != nil {
		return nil, err
	}
	kr, err := corecrypto.NewKeyring(ver, key, legacy)
	if err != nil {
		return nil, err
	}
	supported := map[string]struct{}{ver: {}}
	for v := range legacy {
		supported[v] = struct{}{}
	}
	return &RefreshTokenKeyringSpec{
		Keyring:           kr,
		ActiveVersion:     ver,
		SupportedVersions: supported,
	}, nil
}

func decodeAESKey(raw, envName string) ([]byte, error) {
	key, err := base64.StdEncoding.DecodeString(strings.TrimSpace(raw))
	if err != nil {
		return nil, fmt.Errorf("%s must be valid base64", envName)
	}
	if len(key) != 16 && len(key) != 24 && len(key) != 32 {
		return nil, fmt.Errorf("%s must decode to 16, 24, or 32 bytes (AES-128/192/256)", envName)
	}
	return key, nil
}

func parseLegacyRefreshTokenKeys(raw string, keyLen int, activeVersion string) (map[string][]byte, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, nil
	}
	entries := map[string]string{}
	if err := json.Unmarshal([]byte(trimmed), &entries); err != nil {
		return nil, errors.New("REFRESH_TOKEN_AES_LEGACY_KEYS must be valid JSON object: {\"v1\":\"base64-key\"}")
	}
	legacy := make(map[string][]byte, len(entries))
	for version, keyB64 := range entries {
		v := strings.TrimSpace(version)
		if v == "" {
			return nil, errors.New("REFRESH_TOKEN_AES_LEGACY_KEYS contains an empty version key")
		}
		if v == activeVersion {
			// Active key is provided separately; avoid duplicate-version collisions.
			continue
		}
		key, err := decodeAESKey(keyB64, "REFRESH_TOKEN_AES_LEGACY_KEYS["+v+"]")
		if err != nil {
			return nil, err
		}
		if len(key) != keyLen {
			return nil, fmt.Errorf("REFRESH_TOKEN_AES_LEGACY_KEYS[%s] key length %d must match active key length %d", v, len(key), keyLen)
		}
		legacy[v] = key
	}
	return legacy, nil
}

// SupportedVersionList returns sorted key versions for logs/diagnostics.
func SupportedVersionList(supported map[string]struct{}) []string {
	out := make([]string, 0, len(supported))
	for v := range supported {
		out = append(out, v)
	}
	sort.Strings(out)
	return out
}

// EncryptedRefreshTokenElemMatch returns a Mongo $elemMatch for encrypted refresh token rows.
func EncryptedRefreshTokenElemMatch(fromVersion string) bson.M {
	elem := bson.M{
		"rTokenCiphertext": bson.M{"$exists": true, "$ne": ""},
	}
	fromVersion = strings.TrimSpace(fromVersion)
	if fromVersion != "" {
		elem["rTokenKeyVersion"] = fromVersion
	}
	return elem
}
