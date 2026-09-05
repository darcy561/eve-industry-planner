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
		corpRefToClients:     make(map[string]map[string]bool),
		allianceRefToClients: make(map[string]map[string]bool),
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
		corpRefToClients:     make(map[string]map[string]bool),
		allianceRefToClients: make(map[string]map[string]bool),
	}
	a := &Client{
		id: "a", AccountID: "acct-a",
		grantedCorpRefs:     map[string]struct{}{wsTestCorpRefValue: {}},
		grantedAllianceRefs: map[string]struct{}{wsTestAllianceRefValue: {}},
	}
	b := &Client{
		id: "b", AccountID: "acct-b",
		grantedCorpRefs: map[string]struct{}{wsTestCorpRefValue: {}},
	}

	s.swapClientOrgScopesAndIndexes(a, model.RealtimeScopes{
		CorporationRefs: []string{wsTestCorpRefValue},
		AllianceRefs:    []string{wsTestAllianceRefValue},
	})
	s.swapClientOrgScopesAndIndexes(b, model.RealtimeScopes{
		CorporationRefs: []string{wsTestCorpRefValue},
	})

	if !s.HostsTenant("corporation:"+wsTestCorpRefValue) || !s.HostsTenant("alliance:"+wsTestAllianceRefValue) {
		t.Fatalf("hosted=%v", s.HostedTenants())
	}

	s.unregisterClientFromOrgPools(a)
	delete(s.userConnections, "acct-a")

	if !s.HostsTenant("corporation:" + wsTestCorpRefValue) {
		t.Fatal("corp should remain via client b")
	}
	if s.HostsTenant("alliance:" + wsTestAllianceRefValue) {
		t.Fatal("alliance should drop with client a")
	}
	if !s.HostsTenant("account:acct-b") || s.HostsTenant("account:acct-a") {
		t.Fatalf("accounts=%v", s.HostedTenants())
	}

	got := s.HostedTenants()
	// 2 accounts initially; after unregister a: acct-b + the corporation only (alliance gone).
	want := map[string]bool{"account:acct-b": true, "corporation:" + wsTestCorpRefValue: true}
	if len(got) != 2 {
		t.Fatalf("HostedTenants=%v want 2 keys", got)
	}
	for _, k := range got {
		if !want[k] {
			t.Fatalf("unexpected key %q in %v", k, got)
		}
	}
	// Two tabs on one corporation would still be a single corporation: key.
	if s.HostedTenantCount() != 2 {
		t.Fatalf("HostedTenantCount=%d want 2 distinct keys", s.HostedTenantCount())
	}
}
