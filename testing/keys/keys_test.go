package keys_test

import (
	"os"
	"testing"

	"eve-industry-planner/shared/crypto/entityid"
	"eve-industry-planner/testing/keys"
)

func TestEntityCipher_roundTrips(t *testing.T) {
	c := keys.EntityCipher(t)

	ref, err := c.Corporation(1234567890)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	kind, id, err := c.Decrypt(ref)
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}
	if kind != entityid.KindCorp || id != 1234567890 {
		t.Fatalf("round trip gave kind=%q id=%d", kind, id)
	}
}

// The point of a shared key: two independently built ciphers agree on the ref
// for an id, so a fixture written by one package matches a lookup in another.
func TestEntityCipher_refsAgreeAcrossCiphers(t *testing.T) {
	a := keys.EntityCipher(t)
	b := keys.EntityCipher(t)

	refA, err := a.Corporation(98)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	refB, err := b.Corporation(98)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	if refA != refB {
		t.Fatalf("refs differ: %q vs %q", refA, refB)
	}
}

func TestSetEntityID_makesNewFromEnvWork(t *testing.T) {
	keys.SetEntityID(t)

	if got := os.Getenv(entityid.EnvKey); got != keys.EntityID {
		t.Fatalf("%s = %q", entityid.EnvKey, got)
	}
	c, err := entityid.NewFromEnv()
	if err != nil {
		t.Fatalf("NewFromEnv: %v", err)
	}

	fromEnv, err := c.Alliance(7)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	direct, err := keys.EntityCipher(t).Alliance(7)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	if fromEnv != direct {
		t.Fatal("env-resolved cipher disagrees with EntityCipher")
	}
}
