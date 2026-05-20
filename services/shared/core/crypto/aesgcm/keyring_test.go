package aesgcm

import "testing"

func TestNormalizedActiveVersion(t *testing.T) {
	key := make([]byte, 32)
	kr, err := NewKeyring("  v2  ", key, nil)
	if err != nil {
		t.Fatal(err)
	}
	if kr.NormalizedActiveVersion() != "v2" {
		t.Fatalf("got %q", kr.NormalizedActiveVersion())
	}
	var nilKr *Keyring
	if nilKr.NormalizedActiveVersion() != "v1" {
		t.Fatal("nil keyring should default to v1")
	}
}

func TestRoundTrip(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	kr, err := NewKeyring("v1", key, nil)
	if err != nil {
		t.Fatal(err)
	}
	nonce, ct, ver, err := kr.Encrypt("secret", []byte("aad"))
	if err != nil {
		t.Fatal(err)
	}
	if ver != "v1" {
		t.Fatalf("version %q", ver)
	}
	got, err := kr.Decrypt(ct, nonce, ver, []byte("aad"))
	if err != nil {
		t.Fatal(err)
	}
	if got != "secret" {
		t.Fatalf("got %q", got)
	}
}

func TestAADMismatchFails(t *testing.T) {
	key := make([]byte, 32)
	kr, err := NewKeyring("v1", key, nil)
	if err != nil {
		t.Fatal(err)
	}
	nonce, ct, ver, err := kr.Encrypt("secret", []byte("a"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := kr.Decrypt(ct, nonce, ver, []byte("b")); err == nil {
		t.Fatal("expected decrypt failure")
	}
}

func TestRotateToActive_FromLegacyKey(t *testing.T) {
	keyV1 := make([]byte, 32)
	keyV2 := make([]byte, 32)
	for i := range keyV1 {
		keyV1[i] = byte(i)
		keyV2[i] = byte(i + 1)
	}
	krV1, err := NewKeyring("v1", keyV1, nil)
	if err != nil {
		t.Fatal(err)
	}
	aad := []byte("character-binding")
	nonce, ct, ver, err := krV1.Encrypt("payload", aad)
	if err != nil {
		t.Fatal(err)
	}
	if ver != "v1" {
		t.Fatalf("version %q", ver)
	}

	legacy := map[string][]byte{"v1": keyV1}
	krV2, err := NewKeyring("v2", keyV2, legacy)
	if err != nil {
		t.Fatal(err)
	}
	if krV2.ActiveVersion() != "v2" {
		t.Fatalf("ActiveVersion %q", krV2.ActiveVersion())
	}

	n2, c2, v2, rotated, err := krV2.RotateToActive(ct, nonce, "v1", aad)
	if err != nil {
		t.Fatal(err)
	}
	if !rotated {
		t.Fatal("expected rotation from v1 to active v2")
	}
	if v2 != "v2" {
		t.Fatalf("out version %q", v2)
	}
	got, err := krV2.Decrypt(c2, n2, v2, aad)
	if err != nil {
		t.Fatal(err)
	}
	if got != "payload" {
		t.Fatalf("got %q", got)
	}

	n3, c3, v3, again, err := krV2.RotateToActive(c2, n2, v2, aad)
	if err != nil {
		t.Fatal(err)
	}
	if again {
		t.Fatal("expected idempotent when already active")
	}
	if n3 != n2 || c3 != c2 || v3 != v2 {
		t.Fatal("expected unchanged envelope when already active")
	}
}
