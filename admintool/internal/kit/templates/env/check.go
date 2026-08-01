package env

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"

	"eve-industry-planner/admintool/internal/kit"
)

// legacyPlaceholders are old template strings that must not pass ensure / Ready.
// Fresh WriteMissing leaves EVE SSO blank instead; these catch hand-copied leftovers.
var legacyPlaceholders = map[string]string{
	"EVE_CLIENT_ID":     "your_eve_oauth_client_id",
	"EVE_CLIENT_SECRET": "your_eve_oauth_client_secret",
	"EVE_CALLBACK_URL":  "https://your-domain.com/auth/callback",
}

// CheckUsable verifies .env can be loaded and required keys have non-empty values.
//
// It does NOT run Autogen material Validate (password/HMAC/AES charset or length).
// Existing deployments may predate current generation rules; strength checks belong
// with password/key rolling, not ensure / first-up gates.
//
// Operator-provided secrets (EVE SSO) are blank after WriteMissing — unset until
// Setup / edit; empty or legacy placeholder values fail this check.
func CheckUsable(home string) error {
	path := filepath.Join(home, kit.EnvFile)
	values, err := LoadEnvValues(path)
	if err != nil {
		return fmt.Errorf("%s: %w", kit.EnvFile, err)
	}

	var missing []string
	var sentinel []string
	var placeholders []string
	for _, f := range EnvFields() {
		if !f.Required {
			continue
		}
		v := strings.TrimSpace(values[f.Key])
		if v == "" {
			missing = append(missing, f.Key)
			continue
		}
		if v == AutoGenerateSentinel {
			sentinel = append(sentinel, f.Key)
			continue
		}
		if want, ok := legacyPlaceholders[f.Key]; ok && v == want {
			placeholders = append(placeholders, f.Key)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("%s: required keys empty or unset: %s (set via Setup / Edit)",
			kit.EnvFile, strings.Join(missing, ", "))
	}
	if len(placeholders) > 0 {
		return fmt.Errorf("%s: still template placeholders (set real values via Setup / Edit): %s",
			kit.EnvFile, strings.Join(placeholders, ", "))
	}
	if len(sentinel) > 0 {
		return fmt.Errorf("%s: still %q (run eip init / Setup to generate): %s",
			kit.EnvFile, AutoGenerateSentinel, strings.Join(sentinel, ", "))
	}

	if err := checkLegacyKeysJSON(values["REFRESH_TOKEN_AES_LEGACY_KEYS"]); err != nil {
		return fmt.Errorf("%s: REFRESH_TOKEN_AES_LEGACY_KEYS: %w", kit.EnvFile, err)
	}
	return nil
}

func checkLegacyKeysJSON(raw string) error {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	if !json.Valid([]byte(trimmed)) {
		return fmt.Errorf("must be valid JSON object (use {} when unused)")
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal([]byte(trimmed), &obj); err != nil {
		return fmt.Errorf("must be a JSON object (use {} when unused)")
	}
	return nil
}
