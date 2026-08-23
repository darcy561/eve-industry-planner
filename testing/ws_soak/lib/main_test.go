package soaklib

import (
	"os"
	"testing"

	"eve-industry-planner/shared/crypto/entityid"
	"eve-industry-planner/testing/keys"
)

// The harness derives organisation refs the same way the services do, so it needs
// the authz key. A fixed test key keeps generated tenant keys deterministic across
// runs without depending on the operator's environment.
func TestMain(m *testing.M) {
	if os.Getenv(entityid.EnvKey) == "" {
		_ = os.Setenv(entityid.EnvKey, keys.EntityID)
	}
	os.Exit(m.Run())
}
