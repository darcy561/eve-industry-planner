package server

import (
	"testing"
)

// Register → org scopes → hosted tenants → unregister clears soft hint + tenant keys.
func TestIntegrationHostedTenantsWithSoftFullLifecycle(t *testing.T) {
	f := newIntegFixture(t)
	f.setSlotLimits(1, 5)
	c := f.newClient("c1", "acct-1", []string{"10"}, []string{"99"})
	f.register(c)
	f.setOrgScopes(c, []string{"10"}, []string{"99"})

	if !f.Server.HostsTenant("account:acct-1") ||
		!f.Server.HostsTenant("corporation:10") ||
		!f.Server.HostsTenant("alliance:99") {
		t.Fatalf("hosted=%v", f.Server.HostedTenants())
	}
	if f.Server.HostedTenantCount() != 3 {
		t.Fatalf("HostedTenantCount=%d want 3", f.Server.HostedTenantCount())
	}

	f.syncPlacementHints()
	f.requireRedisValue(f.softKey(), "1")

	f.unregister(c)
	f.syncPlacementHints()

	if f.Server.HostedTenantCount() != 0 {
		t.Fatalf("hosted after disconnect=%v", f.Server.HostedTenants())
	}
	f.requireRedisAbsent(f.softKey())
}
