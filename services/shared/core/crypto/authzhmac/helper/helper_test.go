package helper

import (
	"os"
	"testing"

	"eve-industry-planner/shared/core/crypto/authzhmac/ref"
)

func TestRefDeterminismAndKindSeparation(t *testing.T) {
	h, err := New("v1", []byte("0123456789abcdef0123456789abcdef"))
	if err != nil {
		t.Fatalf("new helper: %v", err)
	}

	corp1, err := h.RefFromCorporationID(123)
	if err != nil {
		t.Fatalf("corp ref: %v", err)
	}
	corp2, err := h.RefFromCorporationID(123)
	if err != nil {
		t.Fatalf("corp ref repeat: %v", err)
	}
	if corp1 != corp2 {
		t.Fatalf("expected deterministic refs, got %q != %q", corp1, corp2)
	}

	charRef, err := h.RefFromCharacterID(123)
	if err != nil {
		t.Fatalf("char ref: %v", err)
	}
	if corp1 == charRef {
		t.Fatalf("kind separation failed, corp and char refs should differ")
	}
}

func TestRejectInvalidIDs(t *testing.T) {
	h, err := New("v1", []byte("0123456789abcdef0123456789abcdef"))
	if err != nil {
		t.Fatalf("new helper: %v", err)
	}
	if _, err := h.RefFromCorporationID(0); err == nil {
		t.Fatal("expected error for id=0")
	}
	if _, err := h.RefFromCorporationID(-1); err == nil {
		t.Fatal("expected error for id<0")
	}
}

func TestNewFromEnv(t *testing.T) {
	oldKey := os.Getenv("AUTHZ_HMAC_KEY")
	oldVer := os.Getenv("AUTHZ_HMAC_KEY_VERSION")
	defer func() {
		_ = os.Setenv("AUTHZ_HMAC_KEY", oldKey)
		_ = os.Setenv("AUTHZ_HMAC_KEY_VERSION", oldVer)
	}()

	_ = os.Unsetenv("AUTHZ_HMAC_KEY")
	if _, err := NewFromEnv(); err == nil {
		t.Fatal("expected NewFromEnv to fail when AUTHZ_HMAC_KEY is missing")
	}

	_ = os.Setenv("AUTHZ_HMAC_KEY", "0123456789abcdef0123456789abcdef")
	_ = os.Setenv("AUTHZ_HMAC_KEY_VERSION", "v9")
	h, err := NewFromEnv()
	if err != nil {
		t.Fatalf("expected NewFromEnv success, got err: %v", err)
	}
	refStr, err := h.RefFromCorporationID(123)
	if err != nil {
		t.Fatalf("RefFromCorporationID failed: %v", err)
	}
	if version, _, ok := ref.ParseRefVersion(refStr); !ok || version != "v9" {
		t.Fatalf("unexpected version in ref %q", refStr)
	}
}
