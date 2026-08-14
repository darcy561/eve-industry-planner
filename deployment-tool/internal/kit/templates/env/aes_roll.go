package env

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

const (
	refreshTokenAESKey        = "REFRESH_TOKEN_AES_KEY"
	refreshTokenAESKeyVersion = "REFRESH_TOKEN_AES_KEY_VERSION"
	refreshTokenAESLegacyKeys = "REFRESH_TOKEN_AES_LEGACY_KEYS"
)

// NextAESKeyVersion bumps vN → v(N+1). Empty / non-vN values are treated as v1 → v2.
func NextAESKeyVersion(cur string) string {
	cur = strings.TrimSpace(cur)
	if cur == "" {
		return "v2"
	}
	if strings.HasPrefix(cur, "v") || strings.HasPrefix(cur, "V") {
		n, err := strconv.Atoi(cur[1:])
		if err == nil && n >= 1 {
			return fmt.Sprintf("v%d", n+1)
		}
	}
	return "v2"
}

// applyRefreshTokenKeyRotation runs after Autogen resolve:
//   - first generate: ensure VERSION defaults to v1
//   - roll (generate while a prior key existed): bump VERSION and stash the old key in LEGACY_KEYS
func applyRefreshTokenKeyRotation(out, prior map[string]string, generate map[string]bool) error {
	var aesField EnvField
	found := false
	for _, f := range EnvFields() {
		if f.Key == refreshTokenAESKey {
			aesField = f
			found = true
			break
		}
	}
	if !found {
		return nil
	}

	priorKey := ""
	if prior != nil {
		priorKey = prior[refreshTokenAESKey]
	}
	if IsLockedInFile(aesField, priorKey) {
		return nil
	}

	gen := false
	if generate != nil {
		if g, set := generate[refreshTokenAESKey]; set {
			gen = g
		} else {
			gen = defaultGenerateFlag(aesField, priorKey)
		}
	} else {
		gen = defaultGenerateFlag(aesField, priorKey)
	}
	if !gen {
		return nil
	}

	if !IsSetSecret(priorKey) {
		if strings.TrimSpace(out[refreshTokenAESKeyVersion]) == "" {
			out[refreshTokenAESKeyVersion] = "v1"
		}
		return nil
	}

	oldVer := strings.TrimSpace(out[refreshTokenAESKeyVersion])
	if oldVer == "" {
		oldVer = "v1"
	}
	newVer := NextAESKeyVersion(oldVer)
	legacy, err := mergeLegacyAESKey(out[refreshTokenAESLegacyKeys], oldVer, strings.TrimSpace(priorKey), newVer)
	if err != nil {
		return fmt.Errorf("%s: %w", refreshTokenAESLegacyKeys, err)
	}
	out[refreshTokenAESLegacyKeys] = legacy
	out[refreshTokenAESKeyVersion] = newVer
	return nil
}

func mergeLegacyAESKey(legacyJSON, oldVer, oldKeyB64, newVer string) (string, error) {
	entries := map[string]string{}
	trimmed := strings.TrimSpace(legacyJSON)
	if trimmed != "" {
		if err := json.Unmarshal([]byte(trimmed), &entries); err != nil {
			return "", fmt.Errorf("invalid JSON (fix or clear before rolling AES): %w", err)
		}
	}
	entries[oldVer] = oldKeyB64
	delete(entries, newVer) // active version must not also appear as legacy
	raw, err := json.Marshal(entries)
	if err != nil {
		return "", err
	}
	return string(raw), nil
}
