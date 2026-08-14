package outgoinglogic

import (
	"encoding/json"
	"testing"
)

func TestDecodeOutboundMessage_scopes(t *testing.T) {
	raw := map[string]any{
		"accountID":     "",
		"allianceID":    "99000001",
		"corporationID": "",
		"scopes": map[string]any{
			"corporationIDs": []any{"98000001", float64(98000002)},
			"accountIDs":     []any{"acct1"},
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
	if d.Route.AllianceID != "99000001" {
		t.Fatalf("alliance id: got %q", d.Route.AllianceID)
	}
	if len(d.Scopes.CorporationIDs) != 2 || d.Scopes.CorporationIDs[0] != "98000001" || d.Scopes.CorporationIDs[1] != "98000002" {
		t.Fatalf("corp scopes: %#v", d.Scopes.CorporationIDs)
	}
	if len(d.Scopes.AccountIDs) != 1 || d.Scopes.AccountIDs[0] != "acct1" {
		t.Fatalf("acct scopes: %#v", d.Scopes.AccountIDs)
	}
}

func TestAllianceRecipientMatchesDownward_union(t *testing.T) {
	scopes := DownwardScopes{
		CorporationIDs: []string{"10"},
		AccountIDs:     []string{"z"},
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
