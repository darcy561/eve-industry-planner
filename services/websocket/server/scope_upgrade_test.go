package server

import (
	"testing"

	"eve-industry-planner/shared/crypto/entityid"
)

// A client asks for scopes by id; grants and indexes hold refs. Conversion happens
// at this boundary, so a raw id must never be compared against a grant.
func TestScopeUpgradeConvertsRequestedIDsToRefs(t *testing.T) {
	h, err := entityid.New([]byte("0123456789abcdef0123456789abcdef"))
	if err != nil {
		t.Fatalf("entityid.New: %v", err)
	}
	corpRef, err := h.Corporation(10)
	if err != nil {
		t.Fatalf("RefFromCorporationID: %v", err)
	}

	s := &Server{entityCipher: h, corpRefToClients: map[string]map[string]bool{}, allianceRefToClients: map[string]map[string]bool{}}
	client := &Client{
		id:                  "c1",
		grantedCorpRefs:     map[string]struct{}{corpRef: {}},
		grantedAllianceRefs: map[string]struct{}{},
	}

	if !s.ApplyRealtimeScopeUpgrade(client, []string{"10"}, nil) {
		t.Fatal("expected the upgrade to apply after converting the id")
	}
	if len(client.Scopes.CorporationRefs) != 1 || client.Scopes.CorporationRefs[0] != corpRef {
		t.Fatalf("scopes = %v, want [%s]", client.Scopes.CorporationRefs, corpRef)
	}
}

// An id outside the grant ceiling must still be refused after conversion.
func TestScopeUpgradeStillHonoursTheGrantCeiling(t *testing.T) {
	h, err := entityid.New([]byte("0123456789abcdef0123456789abcdef"))
	if err != nil {
		t.Fatalf("entityid.New: %v", err)
	}
	granted, err := h.Corporation(10)
	if err != nil {
		t.Fatalf("RefFromCorporationID: %v", err)
	}

	s := &Server{entityCipher: h, corpRefToClients: map[string]map[string]bool{}, allianceRefToClients: map[string]map[string]bool{}}
	client := &Client{
		id:                  "c1",
		grantedCorpRefs:     map[string]struct{}{granted: {}},
		grantedAllianceRefs: map[string]struct{}{},
	}

	if s.ApplyRealtimeScopeUpgrade(client, []string{"999"}, nil) {
		t.Fatal("a corporation outside the grant ceiling must be refused")
	}
}

// Malformed input must be dropped rather than compared raw, which would let a
// client's own string sneak into a grant comparison.
func TestScopeUpgradeDropsMalformedIDs(t *testing.T) {
	h, err := entityid.New([]byte("0123456789abcdef0123456789abcdef"))
	if err != nil {
		t.Fatalf("entityid.New: %v", err)
	}
	s := &Server{entityCipher: h, corpRefToClients: map[string]map[string]bool{}, allianceRefToClients: map[string]map[string]bool{}}
	client := &Client{
		id:                  "c1",
		grantedCorpRefs:     map[string]struct{}{"corp_whatever": {}},
		grantedAllianceRefs: map[string]struct{}{},
	}

	for _, bad := range [][]string{{"corp_whatever"}, {"not-a-number"}, {"0"}, {"-5"}} {
		if s.ApplyRealtimeScopeUpgrade(client, bad, nil) {
			t.Fatalf("expected %v to be dropped", bad)
		}
	}
}

// Without the key no upgrade can be derived; dropping is correct, but it must not
// fall through to comparing raw ids.
func TestScopeUpgradeWithoutAHelperDropsEverything(t *testing.T) {
	s := &Server{corpRefToClients: map[string]map[string]bool{}, allianceRefToClients: map[string]map[string]bool{}}
	client := &Client{
		id:                  "c1",
		grantedCorpRefs:     map[string]struct{}{"10": {}},
		grantedAllianceRefs: map[string]struct{}{},
	}
	if s.ApplyRealtimeScopeUpgrade(client, []string{"10"}, nil) {
		t.Fatal("a raw id must not match a grant when no helper is configured")
	}
}
