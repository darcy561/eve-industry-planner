package conversion

import "testing"

func TestSecurityBandsFollowTheRoundedFigure(t *testing.T) {
	for _, tc := range []struct {
		security float64
		want     string
	}{
		{1.0, SecurityBandHigh},
		{0.5, SecurityBandHigh},
		{0.45, SecurityBandHigh},
		{0.44, SecurityBandLow},
		{0.4, SecurityBandLow},
		{0.1, SecurityBandLow},
		{0.04, SecurityBandNull},
		{0.0, SecurityBandNull},
		{-0.1, SecurityBandNull},
		{-1.0, SecurityBandNull},
	} {
		if got := securityBandFor(tc.security); got != tc.want {
			t.Errorf("securityBandFor(%v) = %q, want %q", tc.security, got, tc.want)
		}
	}
}

func TestEverySystemCarriesItsNameAndBand(t *testing.T) {
	systems := GenerateSolarSystemsOutput(map[string]any{
		"30000142": map[string]any{"name": map[string]any{"en": "Jita"}, "securityStatus": 0.9},
		"30002187": map[string]any{"name": map[string]any{"en": "Amarr"}, "securityStatus": 1.0},
		"30002659": map[string]any{"name": map[string]any{"en": "Dodixie"}, "securityStatus": 0.37},
		"30100000": map[string]any{"name": map[string]any{"en": "Zarzakh"}, "securityStatus": -1.0},
	})

	for id, want := range map[string]SolarSystemOutput{
		"30000142": {Name: "Jita", Security: SecurityBandHigh},
		"30002187": {Name: "Amarr", Security: SecurityBandHigh},
		"30002659": {Name: "Dodixie", Security: SecurityBandLow},
		"30100000": {Name: "Zarzakh", Security: SecurityBandNull},
	} {
		if got := systems[id]; got != want {
			t.Errorf("%s = %+v, want %+v", id, got, want)
		}
	}
}

func TestASystemWithNoSecurityStatusReadsAsNull(t *testing.T) {
	systems := GenerateSolarSystemsOutput(map[string]any{
		"31000001": map[string]any{"name": map[string]any{"en": "J100000"}},
	})

	if got := systems["31000001"].Security; got != SecurityBandNull {
		t.Errorf("security = %q, want %q", got, SecurityBandNull)
	}
}

func TestASystemWithNoNameIsLeftOut(t *testing.T) {
	systems := GenerateSolarSystemsOutput(map[string]any{
		"30000001": map[string]any{"securityStatus": 0.9},
	})

	if _, held := systems["30000001"]; held {
		t.Error("a system with no name was written anyway")
	}
}

// Wormhole space carries a negative security status, so it bands as null without
// a case of its own — which is what the SPA's "Null Sec / WH" option says too.
func TestWormholeSpaceBandsAsNull(t *testing.T) {
	systems := GenerateSolarSystemsOutput(map[string]any{
		"31000005": map[string]any{
			"name":           map[string]any{"en": "Thera"},
			"securityStatus": -0.99,
		},
		"31002238": map[string]any{
			"name":           map[string]any{"en": "J111825"},
			"securityStatus": -1.0,
		},
		"31000001": map[string]any{
			"name":           map[string]any{"en": "Sentinel MZ"},
			"securityStatus": -0.95,
		},
	})

	for id, want := range map[string]string{
		"31000005": SecurityBandNull,
		"31002238": SecurityBandNull,
		"31000001": SecurityBandNull,
	} {
		if got := systems[id].Security; got != want {
			t.Errorf("%s bands as %q, want %q", id, got, want)
		}
	}
}

func TestOnlyTheSystemsAJobCanRunInAreWritten(t *testing.T) {
	named := func(name string) map[string]any {
		return map[string]any{
			"name":           map[string]any{"en": name},
			"securityStatus": -1.0,
		}
	}

	systems := GenerateSolarSystemsOutput(map[string]any{
		"30000142": named("Jita"),
		"30045352": named("Skarkon"),
		"31002238": named("J111825"),
		"32000001": named("AD001"),
		"34000001": named("V-001"),
		"36000001": named("GPMS-01"),
	})

	for _, id := range []string{"30000142", "30045352", "31002238"} {
		if _, held := systems[id]; !held {
			t.Errorf("%s is a system a job can run in and was left out", id)
		}
	}
	for _, id := range []string{"32000001", "34000001", "36000001"} {
		if _, held := systems[id]; held {
			t.Errorf("%s holds no structure and should not be offered", id)
		}
	}
	if len(systems) != 3 {
		t.Errorf("wrote %d systems, want 3", len(systems))
	}
}

func TestTheIndustryRangesAreNewEdenAndWormholeSpace(t *testing.T) {
	for _, tc := range []struct {
		id    int
		takes bool
	}{
		{29999999, false},
		{30000000, true},
		{30999999, true},
		{31000000, true},
		{31999999, true},
		{32000000, false},
		{34000000, false},
		{36000000, false},
	} {
		if got := systemTakesIndustry(tc.id); got != tc.takes {
			t.Errorf("systemTakesIndustry(%d) = %v, want %v", tc.id, got, tc.takes)
		}
	}
}
