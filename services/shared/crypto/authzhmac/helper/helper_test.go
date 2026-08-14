package helper

import (
	"strings"
	"testing"

	"eve-industry-planner/shared/crypto/authzhmac/ref"
)

func testKey() []byte {
	return []byte("0123456789abcdef0123456789abcdef")
}

func TestNew_RejectsShortKey(t *testing.T) {
	if _, err := New("v1", []byte("too-short")); err == nil {
		t.Fatal("expected error for key below the minimum length")
	}
}

func TestNew_DefaultsVersion(t *testing.T) {
	h, err := New("   ", testKey())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if h.Version() != DefaultKeyVersion {
		t.Fatalf("version = %q, want %q", h.Version(), DefaultKeyVersion)
	}
}

func TestRefFromID_Deterministic(t *testing.T) {
	h, err := New("v1", testKey())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	first, err := h.RefFromCharacterID(90000001)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	second, err := h.RefFromCharacterID(90000001)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if first != second {
		t.Fatalf("same id produced %q then %q", first, second)
	}
	if !strings.HasPrefix(first, "v1_char_") {
		t.Fatalf("ref = %q, want a v1_char_ prefix", first)
	}
}

func TestRefFromID_KindsDoNotCollide(t *testing.T) {
	h, err := New("v1", testKey())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	const id = 98000001
	charRef, err := h.RefFromCharacterID(id)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	corpRef, err := h.RefFromCorporationID(id)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	allianceRef, err := h.RefFromAllianceID(id)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// The kind prefix is part of the HMAC input, so one id yields three tokens.
	tokenOf := func(r string) string { return strings.SplitN(r, "_", 3)[2] }
	if tokenOf(charRef) == tokenOf(corpRef) || tokenOf(charRef) == tokenOf(allianceRef) || tokenOf(corpRef) == tokenOf(allianceRef) {
		t.Fatalf("kinds collided for id %d: %q %q %q", id, charRef, corpRef, allianceRef)
	}
}

func TestRefFromID_DiffersByKeyVersion(t *testing.T) {
	v1, err := New("v1", testKey())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	v2, err := New("v2", []byte("fedcba9876543210fedcba9876543210"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	a, err := v1.RefFromCorporationID(98000002)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	b, err := v2.RefFromCorporationID(98000002)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if a == b {
		t.Fatal("refs under different keys should not match")
	}
}

func TestRefFromID_RejectsNonPositiveID(t *testing.T) {
	h, err := New("v1", testKey())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	for _, id := range []int64{0, -1} {
		if _, err := h.RefFromCharacterID(id); err == nil {
			t.Fatalf("expected error for id %d", id)
		}
	}
}

func TestRefFromID_NilHelper(t *testing.T) {
	var h *Helper
	if _, err := h.RefFromCharacterID(1); err == nil {
		t.Fatal("expected error from a nil helper")
	}
}

func TestRefFromID_ProducesValidShape(t *testing.T) {
	h, err := New("v1", testKey())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	for _, derive := range []func(int64) (string, error){
		h.RefFromCharacterID,
		h.RefFromCorporationID,
		h.RefFromAllianceID,
	} {
		got, err := derive(90000003)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !ref.ValidateRefShape(got) {
			t.Fatalf("derived ref %q fails shape validation", got)
		}
	}
}

func TestNewFromEnv_RequiresKey(t *testing.T) {
	t.Setenv("AUTHZ_HMAC_KEY", "")
	if _, err := NewFromEnv(); err == nil {
		t.Fatal("expected error when AUTHZ_HMAC_KEY is unset")
	}
}

func TestNewFromEnv_ReadsVersion(t *testing.T) {
	t.Setenv("AUTHZ_HMAC_KEY", string(testKey()))
	t.Setenv("AUTHZ_HMAC_KEY_VERSION", "v3")

	h, err := NewFromEnv()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if h.Version() != "v3" {
		t.Fatalf("version = %q, want v3", h.Version())
	}
}
