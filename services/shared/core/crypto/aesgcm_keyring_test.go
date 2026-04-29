package corecrypto

import "testing"

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

