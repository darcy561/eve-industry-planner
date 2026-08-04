package server

import (
	"testing"

	"eve-industry-planner/websocket/server/model"
)

func TestHostedTenantsAccountViaUserConnections(t *testing.T) {
	t.Parallel()
	s := &Server{
		userConnections: map[string]map[string]bool{
			"acct-1": {"c1": true},
		},
		corpToClients:     make(map[string]map[string]bool),
		allianceToClients: make(map[string]map[string]bool),
	}
	if !s.HostsTenant("account:acct-1") {
		t.Fatal("expected account hosted")
	}
	if s.HostedTenantCount() != 1 {
		t.Fatalf("count=%d", s.HostedTenantCount())
	}
	delete(s.userConnections, "acct-1")
	if s.HostsTenant("account:acct-1") || s.HostedTenantCount() != 0 {
		t.Fatal("expected cleared")
	}
}

func TestHostedTenantsOrgViaIndexesAndRefcount(t *testing.T) {
	t.Parallel()
	s := &Server{
		userConnections: map[string]map[string]bool{
			"acct-a": {"a": true},
			"acct-b": {"b": true},
		},
		corpToClients:     make(map[string]map[string]bool),
		allianceToClients: make(map[string]map[string]bool),
	}
	a := &Client{
		id: "a", AccountID: "acct-a",
		grantedCorpIDs:     map[string]struct{}{"10": {}},
		grantedAllianceIDs: map[string]struct{}{"99": {}},
	}
	b := &Client{
		id: "b", AccountID: "acct-b",
		grantedCorpIDs: map[string]struct{}{"10": {}},
	}

	s.swapClientOrgScopesAndIndexes(a, model.RealtimeScopes{
		CorporationIDs: []string{"10"},
		AllianceIDs:    []string{"99"},
	})
	s.swapClientOrgScopesAndIndexes(b, model.RealtimeScopes{
		CorporationIDs: []string{"10"},
	})

	if !s.HostsTenant("corporation:10") || !s.HostsTenant("alliance:99") {
		t.Fatalf("hosted=%v", s.HostedTenants())
	}

	s.unregisterClientFromOrgPools(a)
	delete(s.userConnections, "acct-a")

	if !s.HostsTenant("corporation:10") {
		t.Fatal("corp should remain via client b")
	}
	if s.HostsTenant("alliance:99") {
		t.Fatal("alliance should drop with client a")
	}
	if !s.HostsTenant("account:acct-b") || s.HostsTenant("account:acct-a") {
		t.Fatalf("accounts=%v", s.HostedTenants())
	}

	got := s.HostedTenants()
	// 2 accounts initially; after unregister a: acct-b + corp 10 only (alliance gone).
	want := map[string]bool{"account:acct-b": true, "corporation:10": true}
	if len(got) != 2 {
		t.Fatalf("HostedTenants=%v want 2 keys", got)
	}
	for _, k := range got {
		if !want[k] {
			t.Fatalf("unexpected key %q in %v", k, got)
		}
	}
	// Two tabs on corp 10 would still be one corporation: key.
	if s.HostedTenantCount() != 2 {
		t.Fatalf("HostedTenantCount=%d want 2 distinct keys", s.HostedTenantCount())
	}
}
