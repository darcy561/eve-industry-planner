package env

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"regexp"
	"strings"
)

// AutoGenerateSentinel is rejected as a manual value and treated as "unset" when
// reading legacy files. Emit / WriteMissing never write this string.
const AutoGenerateSentinel = "auto-generate-me"

const (
	passwordMinLen = 32
	hmacMinLen     = 43 // url-safe base64; gen uses 48 raw → 64 chars
	passwordGenRaw = 36 // matches ensure-env openssl rand -base64 36
	hmacGenRaw     = 48 // matches ensure-env openssl rand -base64 48
	aesGenRaw      = 32 // AES-256
)

var (
	passwordCharsetRe = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)
	hmacCharsetRe     = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)
)

// IsSetSecret reports a real stored secret (not empty / not sentinel).
func IsSetSecret(value string) bool {
	v := strings.TrimSpace(value)
	return v != "" && v != AutoGenerateSentinel
}

// IsLockedInFile reports whether a Locked field already has a real value and must stay read-only.
func IsLockedInFile(f EnvField, fileValue string) bool {
	return f.Locked && IsSetSecret(fileValue)
}

// RuleHelp returns material rules for gen-capable types (shown when manual entry is enabled).
func RuleHelp(t FieldType) string {
	switch t {
	case FieldPassword:
		return fmt.Sprintf("Password: at least %d characters; A–Z a–z 0–9 _ - only (no $).", passwordMinLen)
	case FieldHMAC:
		return fmt.Sprintf("HMAC key: url-safe base64 alphabet (A–Z a–z 0–9 _ -), min %d chars.", hmacMinLen)
	case FieldAES:
		return "AES key: standard base64 decoding to 16, 24, or 32 bytes (AES-128/192/256)."
	default:
		return ""
	}
}

// Generate creates a new secret for t.
func Generate(t FieldType) (string, error) {
	switch t {
	case FieldPassword:
		return generateURLSafe(passwordGenRaw)
	case FieldHMAC:
		return generateURLSafe(hmacGenRaw)
	case FieldAES:
		raw := make([]byte, aesGenRaw)
		if _, err := rand.Read(raw); err != nil {
			return "", fmt.Errorf("generate AES key: %w", err)
		}
		return base64.StdEncoding.EncodeToString(raw), nil
	default:
		return "", fmt.Errorf("Generate: type %v does not support material generation", t)
	}
}

func generateURLSafe(n int) (string, error) {
	raw := make([]byte, n)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate secret: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

// Validate checks a manual value against Generate output rules.
func Validate(t FieldType, value string) error {
	value = strings.TrimSpace(value)
	if value == "" {
		return fmt.Errorf("value is empty")
	}
	if value == AutoGenerateSentinel {
		return fmt.Errorf("%q is not a valid manual value; check Autogen to generate", AutoGenerateSentinel)
	}
	switch t {
	case FieldPassword:
		if len(value) < passwordMinLen {
			return fmt.Errorf("password must be at least %d characters (got %d)", passwordMinLen, len(value))
		}
		if !passwordCharsetRe.MatchString(value) {
			return fmt.Errorf("password may only contain A–Z, a–z, 0–9, _ and - (no $ or other symbols)")
		}
		return nil
	case FieldHMAC:
		if len(value) < hmacMinLen {
			return fmt.Errorf("HMAC key must be at least %d characters (got %d)", hmacMinLen, len(value))
		}
		if !hmacCharsetRe.MatchString(value) {
			return fmt.Errorf("HMAC key must use url-safe base64 alphabet (A–Z, a–z, 0–9, _, -)")
		}
		return nil
	case FieldAES:
		key, err := base64.StdEncoding.DecodeString(value)
		if err != nil {
			return fmt.Errorf("AES key must be valid standard base64")
		}
		if n := len(key); n != 16 && n != 24 && n != 32 {
			return fmt.Errorf("AES key must decode to 16, 24, or 32 bytes (got %d)", n)
		}
		return nil
	default:
		return nil
	}
}

// ResolveField applies the Autogen checkbox:
//   - generate true  → Generate (ignore value)
//   - generate false → Validate manual value (optional empty stays empty)
//
// Locked fields with an existing real value must not be resolved for change (caller skips).
func ResolveField(f EnvField, value string, generate bool) (string, error) {
	if !f.Autogen {
		return value, nil
	}
	if generate {
		return Generate(f.Type)
	}
	trimmed := strings.TrimSpace(value)
	if !f.Required && trimmed == "" {
		return "", nil
	}
	if err := Validate(f.Type, value); err != nil {
		return "", err
	}
	return trimmed, nil
}

// ResolveEnvFields resolves Autogen fields using per-key generate flags (checkbox state).
// Locked fields that already have a real value in values are left unchanged.
// Keys missing from generate default to false (manual), except sentinel/empty required
// Autogen fields default generate=true for first-write / CLI convenience.
func ResolveEnvFields(values map[string]string, generate map[string]bool) (map[string]string, error) {
	out := make(map[string]string, len(values))
	for k, v := range values {
		out[k] = v
	}
	for _, f := range EnvFields() {
		if !f.Autogen {
			continue
		}
		cur, ok := out[f.Key]
		if !ok {
			cur = f.Default
		}
		if IsLockedInFile(f, cur) {
			out[f.Key] = strings.TrimSpace(cur)
			continue
		}
		gen := false
		if generate != nil {
			if g, set := generate[f.Key]; set {
				gen = g
			} else {
				gen = defaultGenerateFlag(f, cur)
			}
		} else {
			gen = defaultGenerateFlag(f, cur)
		}
		resolved, err := ResolveField(f, cur, gen)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", f.Key, err)
		}
		out[f.Key] = resolved
	}
	return out, nil
}

// DefaultGenerateFlag: checked-by-default when unset/sentinel (first write); manual when a real value exists.
func DefaultGenerateFlag(f EnvField, cur string) bool {
	return defaultGenerateFlag(f, cur)
}

// defaultGenerateFlag: checked-by-default when unset/sentinel (first write); manual when a real value exists.
func defaultGenerateFlag(f EnvField, cur string) bool {
	if !f.Autogen {
		return false
	}
	if IsSetSecret(cur) {
		return false
	}
	if !f.Required && strings.TrimSpace(cur) == "" {
		return false
	}
	return true
}

// AutogenStatus is a short UI label for live validation.
type AutogenStatus int

const (
	AutogenWillGenerate AutogenStatus = iota
	AutogenOK
	AutogenInvalid
	AutogenLocked
)

// ClassifyAutogenCheckbox classifies UI state from the Autogen checkbox + typed value.
func ClassifyAutogenCheckbox(f EnvField, value string, generate bool, locked bool) (AutogenStatus, string) {
	if locked || IsLockedInFile(f, value) {
		return AutogenLocked, "Locked — value cannot be changed here"
	}
	if !f.Autogen {
		return AutogenOK, ""
	}
	if generate {
		return AutogenWillGenerate, "Will generate on save"
	}
	if !f.Required && strings.TrimSpace(value) == "" {
		return AutogenOK, ""
	}
	if err := Validate(f.Type, value); err != nil {
		return AutogenInvalid, err.Error()
	}
	return AutogenOK, "OK"
}
