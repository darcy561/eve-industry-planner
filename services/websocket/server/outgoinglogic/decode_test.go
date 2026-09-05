package outgoinglogic

import (
	"encoding/json"
	"testing"

	"eve-industry-planner/shared/models"
)

func TestDecodeOutboundMessage_scopes(t *testing.T) {
	raw := map[string]any{
		"ownerKey": "alliance:alliance_9_Qm",
		"scopes": map[string]any{
			"corporationRefs": []any{"98000001", float64(98000002)},
			"accountIDs":      []any{"acct1"},
		},
	}
	b, err := json.Marshal(raw)
	if err != nil {
		t.Fatal(err)
	}
	d, err := DecodeOutboundMessage(b)
	if err != nil {
		t.Fatal(err)
	}
	if d.Route.Owner.Kind != models.OwnerAlliance || d.Route.Owner.ID != "alliance_9_Qm" {
		t.Fatalf("owner: got %+v", d.Route.Owner)
	}
	if len(d.Scopes.CorporationRefs) != 2 || d.Scopes.CorporationRefs[0] != "98000001" || d.Scopes.CorporationRefs[1] != "98000002" {
		t.Fatalf("corp scopes: %#v", d.Scopes.CorporationRefs)
	}
	if len(d.Scopes.AccountIDs) != 1 || d.Scopes.AccountIDs[0] != "acct1" {
		t.Fatalf("acct scopes: %#v", d.Scopes.AccountIDs)
	}
}

func TestAllianceRecipientMatchesDownward_union(t *testing.T) {
	scopes := DownwardScopes{
		CorporationRefs: []string{"10"},
		AccountIDs:      []string{"z"},
	}
	if !AllianceRecipientMatchesDownward([]string{"9", "10"}, "other", scopes) {
		t.Fatal("expected corp match")
	}
	if !AllianceRecipientMatchesDownward([]string{"9"}, "z", scopes) {
		t.Fatal("expected account match")
	}
	if AllianceRecipientMatchesDownward([]string{"9"}, "other", scopes) {
		t.Fatal("expected no match")
	}
}

func TestCorporationRecipientMatchesDownward(t *testing.T) {
	scopes := DownwardScopes{AccountIDs: []string{"a", "b"}}
	if !CorporationRecipientMatchesDownward("a", scopes) {
		t.Fatal("expected match")
	}
	if CorporationRecipientMatchesDownward("c", scopes) {
		t.Fatal("expected no match")
	}
	if !CorporationRecipientMatchesDownward("x", DownwardScopes{}) {
		t.Fatal("empty scopes should broadcast to all pooled clients")
	}
}

// The owner key is parsed, not merely split: routing on a corporation or alliance
// id that is not a ref would mean a raw EVE id had reached this layer, which the
// conversion boundary exists to prevent. An unreadable key yields the zero owner,
// which routes to explicit subscribers rather than fanning out to a scope.
func TestDecodeOutboundMessage_refusesAnOwnerKeyItCannotTrust(t *testing.T) {
	for name, key := range map[string]string{
		"raw eve id for an org kind": "alliance:99000001",
		"unknown kind":               "sometthing:abc",
		"no separator":               "account",
		"empty id":                   "account:",
	} {
		t.Run(name, func(t *testing.T) {
			b, err := json.Marshal(map[string]any{"ownerKey": key})
			if err != nil {
				t.Fatal(err)
			}
			d, err := DecodeOutboundMessage(b)
			if err != nil {
				t.Fatal(err)
			}
			if !d.Route.Owner.IsZero() {
				t.Fatalf("owner key %q was accepted as %+v", key, d.Route.Owner)
			}
		})
	}
}

// An account id needs no conversion, so it passes through as it is stored.
func TestDecodeOutboundMessage_readsAnAccountOwner(t *testing.T) {
	b, err := json.Marshal(map[string]any{"ownerKey": "account:acct-1"})
	if err != nil {
		t.Fatal(err)
	}
	d, err := DecodeOutboundMessage(b)
	if err != nil {
		t.Fatal(err)
	}
	if d.Route.Owner.Kind != models.OwnerAccount || d.Route.Owner.ID != "acct-1" {
		t.Fatalf("owner: got %+v", d.Route.Owner)
	}
}
