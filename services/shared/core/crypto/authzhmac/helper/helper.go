package helper

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"os"
	"strconv"
	"strings"
)

const defaultVersion = "v1"

// Helper derives stable ref IDs from numeric entity IDs.
type Helper struct {
	version string
	key     []byte
}

func New(version string, key []byte) (*Helper, error) {
	version = strings.TrimSpace(version)
	if version == "" {
		version = defaultVersion
	}
	if len(key) < 16 {
		return nil, fmt.Errorf("authz hmac key must be at least 16 bytes")
	}
	return &Helper{
		version: version,
		key:     append([]byte(nil), key...),
	}, nil
}

func NewFromEnv() (*Helper, error) {
	keyRaw := strings.TrimSpace(os.Getenv("AUTHZ_HMAC_KEY"))
	if keyRaw == "" {
		return nil, fmt.Errorf("AUTHZ_HMAC_KEY environment variable is required")
	}
	version := strings.TrimSpace(os.Getenv("AUTHZ_HMAC_KEY_VERSION"))
	if version == "" {
		version = defaultVersion
	}
	return New(version, []byte(keyRaw))
}

func (h *Helper) RefFromCharacterID(id int64) (string, error) {
	return h.refFromID("char", id)
}

func (h *Helper) RefFromCorporationID(id int64) (string, error) {
	return h.refFromID("corp", id)
}

func (h *Helper) RefFromAllianceID(id int64) (string, error) {
	return h.refFromID("alliance", id)
}

func (h *Helper) refFromID(kind string, id int64) (string, error) {
	if h == nil {
		return "", fmt.Errorf("authzhmac helper is nil")
	}
	if id <= 0 {
		return "", fmt.Errorf("id must be > 0")
	}
	idStr := strconv.FormatInt(id, 10)
	mac := hmac.New(sha256.New, h.key)
	_, _ = mac.Write([]byte(kind + ":" + idStr))
	token := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return h.version + "_" + kind + "_" + token, nil
}
