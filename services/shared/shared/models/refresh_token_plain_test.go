package models

import (
	"testing"

	corecrypto "eve-industry-planner/shared/core/crypto"
)

func TestRefreshTokenEncryptAndPlainRoundTrip(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	kr, err := corecrypto.NewKeyring("v1", key, nil)
	if err != nil {
		t.Fatal(err)
	}
	rt := &RefreshToken{CharacterHash: "AltHashValue"}
	if err := rt.EncryptRefreshAtRest("plain-refresh-value", kr); err != nil {
		t.Fatal(err)
	}
	if rt.RToken != "" {
		t.Fatal("expected plaintext cleared")
	}
	got, err := rt.PlainRefreshMaterial(kr)
	if err != nil {
		t.Fatal(err)
	}
	if got != "plain-refresh-value" {
		t.Fatalf("got %q", got)
	}
}

func TestRefreshTokenLegacyPlaintextFallback(t *testing.T) {
	key := make([]byte, 32)
	kr, err := corecrypto.NewKeyring("v1", key, nil)
	if err != nil {
		t.Fatal(err)
	}
	rt := &RefreshToken{CharacterHash: "H", RToken: "legacy"}
	got, err := rt.PlainRefreshMaterial(kr)
	if err != nil {
		t.Fatal(err)
	}
	if got != "legacy" {
		t.Fatalf("got %q", got)
	}
}

func TestRefreshTokenDecryptUsesCharacterHashAAD(t *testing.T) {
	key := make([]byte, 32)
	kr, err := corecrypto.NewKeyring("v1", key, nil)
	if err != nil {
		t.Fatal(err)
	}
	rt := &RefreshToken{CharacterHash: "HashA"}
	if err := rt.EncryptRefreshAtRest("secret", kr); err != nil {
		t.Fatal(err)
	}
	rt2 := &RefreshToken{
		CharacterHash:      "Wrong",
		RTokenCiphertext:   rt.RTokenCiphertext,
		RTokenNonce:        rt.RTokenNonce,
		RTokenKeyVersion:   rt.RTokenKeyVersion,
		TokenFormatVersion: rt.TokenFormatVersion,
	}
	if _, err := rt2.PlainRefreshMaterial(kr); err == nil {
		t.Fatal("expected AAD mismatch")
	}
}
