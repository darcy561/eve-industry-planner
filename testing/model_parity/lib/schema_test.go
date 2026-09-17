package modelparity

import (
	"reflect"
	"slices"
	"testing"

	"eve-industry-planner/shared/models"
)

func TestJSONPathsCoversNestedShapes(t *testing.T) {
	paths := JSONPaths(reflect.TypeFor[models.Job]())
	for _, want := range []string{
		"jobID",
		"build.costs.extrasCosts[]",
		"build.costs.extrasCosts[].category",
		"build.setup.{id}.runCount",
		"build.sale.marketOrders[].order_id",
		"layout.esiJobTab",
		"_meta.lastModified",
	} {
		if !slices.Contains(paths, want) {
			t.Errorf("JSONPaths is missing %q", want)
		}
	}
}

// A field the model holds but never serialises must not appear, or the SPA test
// would treat a field the client invented as one the backend knows.
func TestJSONPathsOmitsUnserialisedFields(t *testing.T) {
	paths := JSONPaths(reflect.TypeFor[models.Job]())
	for _, unwanted := range []string{
		"protected",                              // json:"-"
		"build.costs.linkedJobs[].character_ref", // json:"-"
		"_meta.owner",                            // json:"-"
	} {
		if slices.Contains(paths, unwanted) {
			t.Errorf("JSONPaths should not carry %q", unwanted)
		}
	}
}

// omitempty changes whether a field is written, not whether the model has it.
func TestJSONPathsKeepsOmitemptyFields(t *testing.T) {
	paths := JSONPaths(reflect.TypeFor[models.Job]())
	for _, want := range []string{
		"filedCostMonth.month",
		"build.costs.linkedJobs[].character_id",
		"build.costs.linkedJobs[].completed_date",
	} {
		if !slices.Contains(paths, want) {
			t.Errorf("JSONPaths is missing omitempty field %q", want)
		}
	}
}

func TestSchemaPathForSitsBesideTheCorpus(t *testing.T) {
	if got := SchemaPathFor("/out/model-parity/jobs.jsonl"); got != "/out/model-parity/jobs.schema.json" {
		t.Errorf("SchemaPathFor = %q", got)
	}
	if got := SchemaPathFor("jobs"); got != "jobs.schema.json" {
		t.Errorf("SchemaPathFor without an extension = %q", got)
	}
}

// encoding/json reads `json:"-"` as "drop this field" and `json:"-,"` as "a field
// literally named -". A walk that conflates them would hide a real path.
func TestJSONPathsDistinguishesDashTags(t *testing.T) {
	type sample struct {
		Dropped string `json:"-"`
		Dash    string `json:"-,"`
		Kept    string `json:"kept"`
	}
	paths := JSONPaths(reflect.TypeFor[sample]())
	if slices.Contains(paths, "Dropped") {
		t.Error(`json:"-" should drop the field`)
	}
	if !slices.Contains(paths, "-") {
		t.Errorf(`json:"-," should keep a field named "-", got %v`, paths)
	}
	if !slices.Contains(paths, "kept") {
		t.Errorf("kept is missing from %v", paths)
	}
}
