package conversion

import "testing"

func TestLocalisedNameReadsTheOutputLocale(t *testing.T) {
	name, ok := localisedName(map[string]any{
		"name": map[string]any{OutputLocale: "Tritanium", "zz": "Other"},
	})

	if !ok || name != "Tritanium" {
		t.Fatalf("got %q, %v", name, ok)
	}
}

func TestLocalisedNameRefusesWhatItCannotName(t *testing.T) {
	cases := map[string]map[string]any{
		"no name object":  {"published": true},
		"name not object": {"name": "Tritanium"},
		"locale missing":  {"name": map[string]any{"ja": "名前"}},
		"empty name":      {"name": map[string]any{OutputLocale: ""}},
	}

	for label, row := range cases {
		if name, ok := localisedName(row); ok {
			t.Errorf("%s: named it %q", label, name)
		}
	}
}

// CCP marks an expired type in its name, and the marker is its own wording rather
// than a translated field — so the test stays on the English name however the
// published files are localised.
func TestExpiredTypesAreFoundByTheirEnglishName(t *testing.T) {
	expired := []string{"Expired Cerebral Accelerator", "some expired thing"}
	for _, name := range expired {
		row := map[string]any{"name": map[string]any{"en": name}}
		if !isExpiredType(row) {
			t.Errorf("%q was not read as expired", name)
		}
	}

	kept := []string{"Tritanium", "Mining Laser"}
	for _, name := range kept {
		row := map[string]any{"name": map[string]any{"en": name}}
		if isExpiredType(row) {
			t.Errorf("%q was read as expired", name)
		}
	}
}

func TestExpiredTypeKeepsWhatItCannotRead(t *testing.T) {
	for label, row := range map[string]map[string]any{
		"no name object": {"published": true},
		"no english":     {"name": map[string]any{"ja": "名前"}},
	} {
		if isExpiredType(row) {
			t.Errorf("%s: dropped a type it could not read", label)
		}
	}
}

// The two paths the locale refactor moved: an item's display name, and the name
// the invention export carries.
func TestCombinedItemMapNamesFromTheOutputLocale(t *testing.T) {
	items := BuildCombinedItemMap(map[string]any{
		"34": map[string]any{
			"_key":      float64(34),
			"published": true,
			"name":      map[string]any{OutputLocale: "Tritanium"},
		},
		"35": map[string]any{
			"_key":      float64(35),
			"published": true,
			"name":      map[string]any{OutputLocale: "Expired Accelerator"},
		},
	}, map[string]any{})

	item, ok := items["34"]
	if !ok {
		t.Fatal("tritanium missing")
	}
	if got := item.Name; got != "Tritanium" {
		t.Errorf("name = %q", got)
	}
	if _, ok := items["35"]; ok {
		t.Error("an expired type was kept")
	}
}

func TestTypeNameIsEmptyWhenNothingNamesIt(t *testing.T) {
	if got := typeName(map[string]any{"published": true}); got != "" {
		t.Errorf("got %q, want empty", got)
	}
	if got := typeName(map[string]any{
		"name": map[string]any{OutputLocale: "Datacore"},
	}); got != "Datacore" {
		t.Errorf("got %q, want Datacore", got)
	}
}
