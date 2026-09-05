package models

import "testing"

func TestOwnerKeyRoundTrips(t *testing.T) {
	t.Parallel()

	for _, owner := range []Owner{
		AccountOwner("8XGnAtq8QEEQ76LfinJaI8MA6T4"),
		{Kind: OwnerCorporation, ID: "corp_56_JxK"},
		{Kind: OwnerAlliance, ID: "alliance_9_Qm"},
	} {
		got, err := ParseOwnerKey(owner.Key())
		if err != nil {
			t.Fatalf("ParseOwnerKey(%q): %v", owner.Key(), err)
		}
		if got != owner {
			t.Fatalf("round trip: got %+v, want %+v", got, owner)
		}
	}
}

// An id can carry the separator itself, so only the first colon divides kind from
// id. An account id is not shape-constrained — nothing stops one containing a
// colon — which is why the parse takes the whole remainder rather than splitting
// on every separator.
func TestOwnerKeyKeepsColonsInTheID(t *testing.T) {
	t.Parallel()

	owner := AccountOwner("acct:56:JxK")

	got, err := ParseOwnerKey(owner.Key())
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != "acct:56:JxK" {
		t.Fatalf("id = %q, want the whole remainder", got.ID)
	}
}

func TestOwnerValidateRefusesWhatCannotBeReadBack(t *testing.T) {
	t.Parallel()

	cases := map[string]Owner{
		"unknown kind": {Kind: "character", ID: "x"},
		"no kind":      {ID: "x"},
		"no id":        {Kind: OwnerAccount},
		"blank id":     {Kind: OwnerAccount, ID: "   "},
	}
	for name, owner := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if err := owner.Validate(); err == nil {
				t.Fatalf("%+v validated", owner)
			}
		})
	}
}

func TestParseOwnerKeyRefusesAKeyWithNoKind(t *testing.T) {
	t.Parallel()

	if _, err := ParseOwnerKey("8XGnAtq8QEEQ76LfinJaI8MA6T4"); err == nil {
		t.Fatal("a bare id parsed as an owner key")
	}
}
