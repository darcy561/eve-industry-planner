package server

import (
	"testing"
)

// Register → org scopes → hosted tenants → unregister clears soft on /placement.
//
// The org scopes are refs, not raw EVE ids: the indexes hold refs, and a tenant
// key naming a raw id is refused by both HostsTenant and HostedTenants — nothing
// could ever publish to one, because the subject is built from a validated owner.
func TestIntegrationHostedTenantsWithSoftFullLifecycle(t *testing.T) {
	const (
		corpRef     = "corp_56_J_DzQdPpjXwi9Xtp3C8bri9Bfi0Z94qUulkbKCac"
		allianceRef = "alliance_DWc0i6y_cTAGa4QSZWC0S94Zm7vUclxiUNHlNPthzvc"
	)
	f := newIntegFixture(t)
	f.setPlacementLimits(1, 5)
	c := f.newClient("c1", "acct-1", []string{corpRef}, []string{allianceRef})
	f.register(c)
	f.setOrgScopes(c, []string{corpRef}, []string{allianceRef})

	if !f.Server.HostsTenant("account:acct-1") ||
		!f.Server.HostsTenant("corporation:"+corpRef) ||
		!f.Server.HostsTenant("alliance:"+allianceRef) {
		t.Fatalf("hosted=%v", f.Server.HostedTenants())
	}
	if f.Server.HostedTenantCount() != 3 {
		t.Fatalf("HostedTenantCount=%d want 3", f.Server.HostedTenantCount())
	}

	f.syncPlacementHints()
	f.requirePlacement(true, false, 1)

	f.unregister(c)
	f.syncPlacementHints()

	if f.Server.HostedTenantCount() != 0 {
		t.Fatalf("hosted after disconnect=%v", f.Server.HostedTenants())
	}
	f.requirePlacement(false, false, 0)
}
