// Package keys holds the key material tests share.
//
// A test key is only useful if every test uses the same one: entity refs are
// deterministic, so a value encrypted under one key does not match a lookup
// derived under another. Keeping the secret here rather than repeating a
// literal per package means fixtures, wire-contract tests and the soak tools
// all agree on what a ref for a given id looks like.
//
// Nothing here is an operator secret. Real keys come from the environment or
// /run/secrets.
package keys

import (
	"testing"

	"eve-industry-planner/shared/crypto/entityid"
)

// EntityID is the shared entity-ref secret for tests. Any value at or above
// the entityid minimum works; this one is fixed so refs are reproducible
// across packages and runs.
const EntityID = "0123456789abcdef0123456789abcdef"

// EntityCipher builds an entity-ref cipher from EntityID.
func EntityCipher(t testing.TB) *entityid.Cipher {
	t.Helper()
	c, err := entityid.New([]byte(EntityID))
	if err != nil {
		t.Fatalf("entity cipher: %v", err)
	}
	return c
}

// SetEntityID installs EntityID into the environment for the duration of the
// test, for code that resolves the cipher itself via entityid.NewFromEnv.
func SetEntityID(t testing.TB) {
	t.Helper()
	t.Setenv(entityid.EnvKey, EntityID)
}
