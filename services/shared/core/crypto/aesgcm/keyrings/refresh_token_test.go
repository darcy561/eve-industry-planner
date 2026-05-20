package keyrings

import (
	"encoding/base64"
	"testing"
)

func TestNewRefreshTokenKeyring_WithLegacyKeys(t *testing.T) {
	active := make([]byte, 32)
	legacy := make([]byte, 32)
	for i := range active {
		active[i] = byte(i + 1)
		legacy[i] = byte(i + 2)
	}

	t.Setenv("REFRESH_TOKEN_AES_KEY", base64.StdEncoding.EncodeToString(active))
	t.Setenv("REFRESH_TOKEN_AES_KEY_VERSION", "v2")
	t.Setenv("REFRESH_TOKEN_AES_LEGACY_KEYS", `{"v1":"`+base64.StdEncoding.EncodeToString(legacy)+`"}`)

	kr, err := NewRefreshTokenKeyring()
	if err != nil {
		t.Fatal(err)
	}

	nonce, ct, ver, err := kr.Encrypt("secret", []byte("aad"))
	if err != nil {
		t.Fatal(err)
	}
	if ver != "v2" {
		t.Fatalf("expected active version v2, got %q", ver)
	}
	got, err := kr.Decrypt(ct, nonce, ver, []byte("aad"))
	if err != nil {
		t.Fatal(err)
	}
	if got != "secret" {
		t.Fatalf("got %q", got)
	}
}

func TestNewRefreshTokenKeyring_RejectsInvalidLegacyJSON(t *testing.T) {
	key := make([]byte, 32)
	t.Setenv("REFRESH_TOKEN_AES_KEY", base64.StdEncoding.EncodeToString(key))
	t.Setenv("REFRESH_TOKEN_AES_KEY_VERSION", "v1")
	t.Setenv("REFRESH_TOKEN_AES_LEGACY_KEYS", `not-json`)

	if _, err := NewRefreshTokenKeyring(); err == nil {
		t.Fatal("expected error for invalid legacy JSON")
	}
}

func TestNewRefreshTokenKeyring_RejectsMismatchedLegacyLength(t *testing.T) {
	active := make([]byte, 32)
	legacyShort := make([]byte, 16)
	t.Setenv("REFRESH_TOKEN_AES_KEY", base64.StdEncoding.EncodeToString(active))
	t.Setenv("REFRESH_TOKEN_AES_KEY_VERSION", "v2")
	t.Setenv("REFRESH_TOKEN_AES_LEGACY_KEYS", `{"v1":"`+base64.StdEncoding.EncodeToString(legacyShort)+`"}`)

	if _, err := NewRefreshTokenKeyring(); err == nil {
		t.Fatal("expected key length mismatch error")
	}
}
