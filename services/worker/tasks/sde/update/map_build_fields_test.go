package update

import (
	"testing"

	"eve-industry-planner/worker/tasks/sde/update/conversion"
)

// Every file with an allowlist must keep _key: the row is stored under it.
func TestMapBuildFields_keepTheRowKey(t *testing.T) {
	for filename := range mapBuildFields {
		keep, ok := keepFieldsFor(filename)
		if !ok {
			t.Fatalf("%s has no allowlist", filename)
		}
		if _, held := keep["_key"]; !held {
			t.Errorf("%s drops _key, so every row would be discarded", filename)
		}
	}
}

// blueprints.jsonl must stay unfiltered: its activity objects are marshalled
// verbatim into output/recipeList.json, so an unread key there is still published.
func TestMapBuildFields_blueprintsAreNotFiltered(t *testing.T) {
	if _, ok := mapBuildFields["blueprints.jsonl"]; ok {
		t.Fatal("blueprints.jsonl has an allowlist; its activities ship verbatim and must keep every key")
	}
	if _, ok := keepFieldsFor("blueprints.jsonl"); ok {
		t.Fatal("keepFieldsFor filters blueprints.jsonl")
	}
}

// Each allowlisted file must be one the stage actually reads.
func TestMapBuildFields_coverKnownFilesOnly(t *testing.T) {
	for filename := range mapBuildFields {
		if _, ok := requiredFiles[filename]; !ok {
			t.Errorf("%s is allowlisted but not a required file", filename)
		}
	}
	for filename := range localisedNameFiles {
		if _, ok := mapBuildFields[filename]; !ok {
			t.Errorf("%s reduces its name locale but has no allowlist", filename)
		}
	}
}

// The reprocessing conversion ranges every value of a TypeMaterials row instead
// of naming "materials", so any row key holding a material array reaches output.
// Dropping randomizedMaterials silently shrank output/reprocessingData.json.
func TestMapBuildFields_typeMaterialsKeepsRandomisedMaterials(t *testing.T) {
	keep, ok := keepFieldsFor("typeMaterials.jsonl")
	if !ok {
		t.Fatal("typeMaterials.jsonl has no allowlist")
	}
	for _, field := range []string{"materials", "randomizedMaterials"} {
		if _, held := keep[field]; !held {
			t.Errorf("typeMaterials.jsonl drops %s, which the reprocessing output reads", field)
		}
	}
}

func TestPublishedLocaleOnly(t *testing.T) {
	t.Run("keeps only the published locale", func(t *testing.T) {
		got := publishedLocaleOnly(map[string]any{
			"en": "Tritanium", "de": "Tritanium", "ja": "トリタニウム", "ru": "Тританиум",
		})
		obj, ok := got.(map[string]any)
		if !ok {
			t.Fatalf("expected a locale object, got %T", got)
		}
		if len(obj) != 1 {
			t.Fatalf("expected 1 locale, got %d: %v", len(obj), obj)
		}
		if obj[conversion.OutputLocale] != "Tritanium" {
			t.Errorf("published locale lost: %v", obj)
		}
	})

	t.Run("leaves a plain string name alone", func(t *testing.T) {
		if got := publishedLocaleOnly("shieldCapacity"); got != "shieldCapacity" {
			t.Errorf("a plain name was rewritten: %v", got)
		}
	})

	t.Run("leaves a row with no published locale alone", func(t *testing.T) {
		in := map[string]any{"de": "Nur Deutsch"}
		got, ok := publishedLocaleOnly(in).(map[string]any)
		if !ok || len(got) != 1 || got["de"] != "Nur Deutsch" {
			t.Errorf("a row without the published locale was altered: %v", got)
		}
	})
}

// The filter must drop unread keys and keep allowlisted ones.
func TestParseJSONLToKeyedMap_appliesTheAllowlist(t *testing.T) {
	row := []byte(`{"_key":34,"groupID":18,"published":true,"description":{"en":"long"},` +
		`"name":{"en":"Tritanium","de":"Tritanium"},"radius":5,"soundID":9}` + "\n")

	out, err := parseJSONLToKeyedMap(row, "types.jsonl")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	parsed, ok := out["34"].(map[string]any)
	if !ok {
		t.Fatalf("row not keyed by _key: %v", out)
	}

	for _, dropped := range []string{"description", "radius", "soundID"} {
		if _, held := parsed[dropped]; held {
			t.Errorf("%s survived the allowlist", dropped)
		}
	}
	for _, kept := range []string{"_key", "groupID", "published", "name"} {
		if _, held := parsed[kept]; !held {
			t.Errorf("%s was dropped but the conversion reads it", kept)
		}
	}
	if name, ok := parsed["name"].(map[string]any); !ok || len(name) != 1 {
		t.Errorf("name was not reduced to the published locale: %v", parsed["name"])
	}
}

// A file with no allowlist keeps every key.
func TestParseJSONLToKeyedMap_unfilteredFileKeepsEveryKey(t *testing.T) {
	row := []byte(`{"_key":1,"activities":{"copying":{"time":480}},"maxProductionLimit":300}` + "\n")

	out, err := parseJSONLToKeyedMap(row, "blueprints.jsonl")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	parsed, ok := out["1"].(map[string]any)
	if !ok {
		t.Fatalf("row not keyed by _key: %v", out)
	}
	if _, held := parsed["activities"]; !held {
		t.Error("activities was dropped from an unfiltered file")
	}
	if _, held := parsed["maxProductionLimit"]; !held {
		t.Error("maxProductionLimit was dropped from an unfiltered file")
	}
}
