package models

import (
	"testing"

	corecrypto "eve-industry-planner/shared/core/crypto/aesgcm"
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

func TestReencryptTowardActiveVersion_skipUntagged(t *testing.T) {
	keyV1 := make([]byte, 32)
	keyV2 := make([]byte, 32)
	for i := range keyV1 {
		keyV1[i] = byte(i)
		keyV2[i] = byte(i + 1)
	}
	krV1, err := corecrypto.NewKeyring("v1", keyV1, nil)
	if err != nil {
		t.Fatal(err)
	}
	rt := &RefreshToken{CharacterHash: "AltHashValue"}
	if err := rt.EncryptRefreshAtRest("secret", krV1); err != nil {
		t.Fatal(err)
	}
	legacy := map[string][]byte{"v1": keyV1}
	krV2, err := corecrypto.NewKeyring("v2", keyV2, legacy)
	if err != nil {
		t.Fatal(err)
	}
	rotated, err := rt.ReencryptTowardActiveVersion(krV2, true)
	if err != nil {
		t.Fatal(err)
	}
	if !rotated {
		t.Fatal("expected rotation when stored version != active")
	}
	if rt.RTokenKeyVersion != "v2" {
		t.Fatalf("got version %q", rt.RTokenKeyVersion)
	}
	got, err := rt.PlainRefreshMaterial(krV2)
	if err != nil {
		t.Fatal(err)
	}
	if got != "secret" {
		t.Fatalf("plaintext changed: %q", got)
	}
	again, err := rt.ReencryptTowardActiveVersion(krV2, true)
	if err != nil {
		t.Fatal(err)
	}
	if again {
		t.Fatal("expected no-op when already at active version")
	}
}

func TestReencryptTowardActiveVersion_legacyPlaintext(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	kr, err := corecrypto.NewKeyring("v1", key, nil)
	if err != nil {
		t.Fatal(err)
	}
	rt := &RefreshToken{CharacterHash: "H", RToken: "legacy-plain"}
	rotated, err := rt.ReencryptTowardActiveVersion(kr, false)
	if err != nil {
		t.Fatal(err)
	}
	if !rotated {
		t.Fatal("expected wrap when version empty and active is v1 but row not yet ciphertext")
	}
	if rt.RToken != "" {
		t.Fatal("expected legacy cleared after encrypt")
	}
	if rt.RTokenKeyVersion != "v1" {
		t.Fatalf("version %q", rt.RTokenKeyVersion)
	}
	again, err := rt.ReencryptTowardActiveVersion(kr, false)
	if err != nil {
		t.Fatal(err)
	}
	if again {
		t.Fatal("expected idempotent when already v1")
	}
}
