package models

import "testing"

func TestStatsOwnerKeyRoundTrips(t *testing.T) {
	t.Parallel()

	for _, owner := range []StatsOwner{
		AccountStatsOwner("8XGnAtq8QEEQ76LfinJaI8MA6T4"),
		{Kind: StatsOwnerCorporation, ID: "corp_56_JxK"},
		{Kind: StatsOwnerAlliance, ID: "alliance_9_Qm"},
	} {
		got, err := ParseStatsOwnerKey(owner.Key())
		if err != nil {
			t.Fatalf("ParseStatsOwnerKey(%q): %v", owner.Key(), err)
		}
		if got != owner {
			t.Fatalf("round trip: got %+v, want %+v", got, owner)
		}
	}
}

// A ref can carry its own separator, so only the first one divides kind from id.
func TestStatsOwnerKeyKeepsColonsInTheID(t *testing.T) {
	t.Parallel()

	owner := StatsOwner{Kind: StatsOwnerCorporation, ID: "corp:56:JxK"}

	got, err := ParseStatsOwnerKey(owner.Key())
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != "corp:56:JxK" {
		t.Fatalf("id = %q, want the whole remainder", got.ID)
	}
}

func TestStatsOwnerValidateRefusesWhatCannotBeReadBack(t *testing.T) {
	t.Parallel()

	cases := map[string]StatsOwner{
		"unknown kind": {Kind: "character", ID: "x"},
		"no kind":      {ID: "x"},
		"no id":        {Kind: StatsOwnerAccount},
		"blank id":     {Kind: StatsOwnerAccount, ID: "   "},
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

func TestParseStatsOwnerKeyRefusesAKeyWithNoKind(t *testing.T) {
	t.Parallel()

	if _, err := ParseStatsOwnerKey("8XGnAtq8QEEQ76LfinJaI8MA6T4"); err == nil {
		t.Fatal("a bare id parsed as an owner key")
	}
}
