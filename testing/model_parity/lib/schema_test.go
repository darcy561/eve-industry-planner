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
		"build.extrasCosts.{id}",
		"build.extrasCosts.{id}.category",
		"build.setup.{id}.runCount",
		"esi.marketOrders.{id}.order_id",
		"layout.esiJobTab",
		"_meta.lastModified",
	} {
		if !slices.Contains(paths, want) {
			t.Errorf("JSONPaths is missing %q", want)
		}
	}
}

func TestJSONPathsOmitsUnserialisedFields(t *testing.T) {
	paths := JSONPaths(reflect.TypeFor[models.Job]())
	for _, unwanted := range []string{
		"protected",
		"esi.industryJobs.{id}.character_ref",
		"esi.industryJobs.{id}.corporation_ref",
		"_meta.owner",
	} {
		if slices.Contains(paths, unwanted) {
			t.Errorf("JSONPaths should not carry %q", unwanted)
		}
	}
}

func TestJSONPathsKeepsOmitemptyFields(t *testing.T) {
	paths := JSONPaths(reflect.TypeFor[models.Job]())
	for _, want := range []string{
		"filedCostMonth.month",
		"esi.industryJobs.{id}.character_id",
		"esi.industryJobs.{id}.completed_date",
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
