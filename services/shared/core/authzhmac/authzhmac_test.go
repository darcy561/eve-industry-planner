package authzhmac

import (
	"os"
	"testing"
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

func TestParseAndValidateShape(t *testing.T) {
	h, err := New("v2", []byte("0123456789abcdef0123456789abcdef"))
	if err != nil {
		t.Fatalf("new helper: %v", err)
	}
	ref, err := h.RefFromAllianceID(456)
	if err != nil {
		t.Fatalf("alliance ref: %v", err)
	}
	version, kind, ok := ParseRefVersion(ref)
	if !ok {
		t.Fatalf("ParseRefVersion returned !ok for %q", ref)
	}
	if version != "v2" || kind != "alliance" {
		t.Fatalf("unexpected parse result: version=%q kind=%q", version, kind)
	}
	if !ValidateRefShape(ref) {
		t.Fatalf("ValidateRefShape should accept %q", ref)
	}
	if ValidateRefShape("v2_alliance_bad+token") {
		t.Fatal("ValidateRefShape should reject non-base64url token chars")
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
	ref, err := h.RefFromCorporationID(123)
	if err != nil {
		t.Fatalf("RefFromCorporationID failed: %v", err)
	}
	if version, _, ok := ParseRefVersion(ref); !ok || version != "v9" {
		t.Fatalf("unexpected version in ref %q", ref)
	}
}
