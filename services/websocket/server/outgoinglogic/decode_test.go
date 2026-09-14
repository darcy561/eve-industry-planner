package outgoinglogic

import (
	"encoding/json"
	"testing"

	"eve-industry-planner/shared/models"
)

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
