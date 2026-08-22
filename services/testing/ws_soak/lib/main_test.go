package soaklib

import (
	"os"
	"testing"
)

// The harness derives organisation refs the same way the services do, so it needs
// the authz key. A fixed test key keeps generated tenant keys deterministic across
// runs without depending on the operator's environment.
func TestMain(m *testing.M) {
	if os.Getenv("ENTITY_ID_KEY") == "" {
		_ = os.Setenv("ENTITY_ID_KEY", "0123456789abcdef0123456789abcdef")
	}
	os.Exit(m.Run())
}
