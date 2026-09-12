package conversion

import "testing"

func solarSystemsFixture() map[string]any {
	return map[string]any{
		"30000142": map[string]any{
			"name": map[string]any{"en": "Jita", "de": "Jita", "ja": "ジタ"},
		},
		"31000001": map[string]any{
			"name": map[string]any{"en": "Sentinel MZ"},
		},
		// A row the source carries with no name object at all.
		"30099999": map[string]any{"regionID": float64(10000001)},
		// A name object without the locale the output is built in.
		"30099998": map[string]any{
			"name": map[string]any{"ja": "名前"},
		},
	}
}

func TestSolarSystemsAreNamedByID(t *testing.T) {
	systems := GenerateSolarSystemsOutput(solarSystemsFixture())

	if systems["30000142"] != "Jita" {
		t.Errorf("30000142 = %q, want Jita", systems["30000142"])
	}
	if systems["31000001"] != "Sentinel MZ" {
		t.Errorf("31000001 = %q, want Sentinel MZ", systems["31000001"])
	}
}

// A system the output cannot name is left out rather than carried with an empty
// name: the SPA falls back on a missing key, and an empty string would render as
// a blank label instead.
func TestSolarSystemsWithoutANameAreOmitted(t *testing.T) {
	systems := GenerateSolarSystemsOutput(solarSystemsFixture())

	for _, id := range []string{"30099999", "30099998"} {
		if name, ok := systems[id]; ok {
			t.Errorf("%s was kept as %q", id, name)
		}
	}
}

func TestSolarSystemsReadTheOutputLocale(t *testing.T) {
	systems := GenerateSolarSystemsOutput(map[string]any{
		"30000142": map[string]any{
			"name": map[string]any{OutputLocale: "Expected", "zz": "Other"},
		},
	})

	if systems["30000142"] != "Expected" {
		t.Errorf("got %q, want the OutputLocale name", systems["30000142"])
	}
}
