package staticdata

import (
	"testing"

	sdecore "eve-industry-planner/shared/core/sde"
)

// The meta endpoint advertises every published file from the SDE definitions, so
// a file without a route is one every client asks for and takes a 404 on. This
// is how solarSystems.json was served to nobody while the SPA requested it on
// every load.
func TestEveryPublishedFileIsRouted(t *testing.T) {
	routes := FileRoutes()

	for key, fileName := range sdecore.OutputFilesByKey() {
		path := "/api/static-data/" + fileName
		if routes[path] == nil {
			t.Errorf("%s (%s) is published and advertised by meta, but nothing serves %s",
				key, fileName, path)
		}
	}

	if len(routes) != len(sdecore.OutputFileNames()) {
		t.Errorf("routes = %d, published files = %d: a route serves a file that is not published",
			len(routes), len(sdecore.OutputFileNames()))
	}
}

// The metric name is what the file's instruments and error labels carry, so it
// has to stay the snake_case name rather than follow the file's own spelling.
func TestFileMetricNames(t *testing.T) {
	for _, tc := range []struct {
		fileName string
		want     string
	}{
		{"fullItemList.json", "full_item_list"},
		{"searchIndex.json", "search_index"},
		{"reprocessingData.json", "reprocessing_data"},
		{"solarSystems.json", "solar_systems"},
		{"recipeList.json", "recipe_list"},
		{"marketGroups.json", "market_groups"},
		{"inventionModifiers.json", "invention_modifiers"},
	} {
		if got := staticDataMetricName(tc.fileName); got != tc.want {
			t.Errorf("staticDataMetricName(%q) = %q, want %q", tc.fileName, got, tc.want)
		}
	}
}
