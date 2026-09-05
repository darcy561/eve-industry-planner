package models

import "testing"

const (
	validCorpRef     = "corp_56_J_DzQdPpjXwi9Xtp3C8bri9Bfi0Z94qUulkbKCac"
	validAllianceRef = "alliance_DWc0i6y_cTAGa4QSZWC0S94Zm7vUclxiUNHlNPthzvc"
)

func TestOrgOwnersAcceptRefs(t *testing.T) {
	t.Parallel()
	if got := CorporationOwner(validCorpRef); got.Kind != OwnerCorporation || got.ID != validCorpRef {
		t.Fatalf("corporation owner = %+v", got)
	}
	if got := AllianceOwner(validAllianceRef); got.Kind != OwnerAlliance || got.ID != validAllianceRef {
		t.Fatalf("alliance owner = %+v", got)
	}
}

// The guard exists so an unconverted caller fails visibly instead of routing on a
// raw entity id, which would leak the id into placement and affinity cookies.
func TestOrgOwnersRejectRawIDs(t *testing.T) {
	t.Parallel()
	for _, raw := range []string{"98765432", "10", "0", "-1"} {
		if got := CorporationOwner(raw); !got.IsZero() {
			t.Fatalf("CorporationOwner(%q) = %+v, want zero", raw, got)
		}
		if got := AllianceOwner(raw); !got.IsZero() {
			t.Fatalf("AllianceOwner(%q) = %+v, want zero", raw, got)
		}
	}
}

// A ref of the wrong kind must not build an owner, so a character or alliance ref
// cannot be routed as a corporation.
func TestOrgOwnersRejectTheWrongKind(t *testing.T) {
	t.Parallel()
	if got := CorporationOwner(validAllianceRef); !got.IsZero() {
		t.Fatalf("alliance ref built a corporation owner: %+v", got)
	}
	if got := AllianceOwner(validCorpRef); !got.IsZero() {
		t.Fatalf("corporation ref built an alliance owner: %+v", got)
	}
	if got := CorporationOwner("char_abc123"); !got.IsZero() {
		t.Fatalf("character ref built a corporation owner: %+v", got)
	}
}

func TestOrgOwnersRejectMalformedRefs(t *testing.T) {
	t.Parallel()
	for _, bad := range []string{"", "   ", "corp_", "corp", "corp_abc=", "corp_abc!", "v1_corp_abc"} {
		if got := CorporationOwner(bad); !got.IsZero() {
			t.Fatalf("CorporationOwner(%q) = %+v, want zero", bad, got)
		}
	}
}

// An owner read back from storage or off the wire is held to the same rule as one
// just built — construction is not the only way one arrives.
func TestValidateRefusesAnOrgOwnerCarryingARawID(t *testing.T) {
	t.Parallel()
	if err := (Owner{Kind: OwnerCorporation, ID: "98765432"}).Validate(); err == nil {
		t.Fatal("a corporation owner holding a raw EVE id should not validate")
	}
	if err := (Owner{Kind: OwnerAlliance, ID: validCorpRef}).Validate(); err == nil {
		t.Fatal("an alliance owner holding a corporation ref should not validate")
	}
	if err := (Owner{Kind: OwnerCorporation, ID: validCorpRef}).Validate(); err != nil {
		t.Fatalf("a well formed corporation ref should validate: %v", err)
	}
}

// Account ids are not entity refs and keep their own shape.
func TestAccountOwnerIsUnguardedButTrimmed(t *testing.T) {
	t.Parallel()
	if got := AccountOwner("acct-1"); got.Key() != "account:acct-1" {
		t.Fatalf("account key = %q", got.Key())
	}
	if got := AccountOwner("  acct-1  "); got.ID != "acct-1" {
		t.Fatalf("id = %q, want it trimmed", got.ID)
	}
	if err := AccountOwner("   ").Validate(); err == nil {
		t.Fatal("a blank account id should not validate")
	}
}
