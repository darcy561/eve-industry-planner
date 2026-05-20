package sealedfields

import (
	"encoding/json"
	"testing"

	corecrypto "eve-industry-planner/shared/core/crypto/aesgcm"
)

func testKeyring(t *testing.T) *corecrypto.Keyring {
	t.Helper()
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i + 1)
	}
	kr, err := corecrypto.NewKeyring("v1", key, nil)
	if err != nil {
		t.Fatalf("new keyring: %v", err)
	}
	return kr
}

func TestSealAndOpenRoundTrip(t *testing.T) {
	kr := testKeyring(t)
	plaintext := []byte(`{"tx":{"1":{"corp":100,"char":200}}}`)
	fields := []string{
		"build.sale.transactions[*].corporation_id",
		"build.sale.transactions[*].character_id",
	}

	sealed, err := Seal(kr, "entity_ids", 1, plaintext, fields)
	if err != nil {
		t.Fatalf("seal: %v", err)
	}
	if sealed.Domain != "entity_ids" || sealed.PayloadVersion != 1 {
		t.Fatalf("unexpected domain/version: %s v%d", sealed.Domain, sealed.PayloadVersion)
	}
	if sealed.KeyVersion != "v1" {
		t.Fatalf("unexpected key version: %s", sealed.KeyVersion)
	}

	opened, err := Open(kr, sealed)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if string(opened) != string(plaintext) {
		t.Fatalf("opened payload mismatch: got %s want %s", string(opened), string(plaintext))
	}
}

func TestOpenAs(t *testing.T) {
	kr := testKeyring(t)
	raw := []byte(`{"value":42,"label":"ok"}`)
	sealed, err := Seal(kr, "test_domain", 1, raw, []string{"x"})
	if err != nil {
		t.Fatalf("seal: %v", err)
	}

	type payload struct {
		Value int    `json:"value"`
		Label string `json:"label"`
	}
	got, err := OpenAs[payload](kr, sealed)
	if err != nil {
		t.Fatalf("openAs: %v", err)
	}
	if got.Value != 42 || got.Label != "ok" {
		t.Fatalf("decoded payload mismatch: %+v", got)
	}
}

func TestAADBindingRejectsWrongVersion(t *testing.T) {
	kr := testKeyring(t)
	plaintext, _ := json.Marshal(map[string]any{"x": 1})
	sealed, err := Seal(kr, "entity_ids", 1, plaintext, nil)
	if err != nil {
		t.Fatalf("seal: %v", err)
	}

	// Change payload version; AAD no longer matches.
	sealed.PayloadVersion = 2
	if _, err := Open(kr, sealed); err == nil {
		t.Fatal("expected open to fail on aad mismatch")
	}
}
