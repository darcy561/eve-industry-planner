package models

import (
	"strings"
	"testing"

	"encoding/json/jsontext"
)

func writeJob() *Job {
	return &Job{
		JobID: "job-1",
		Name:  "A job",
		Build: JobBuild{
			Materials: map[string]JobMaterial{
				"34": {TypeID: 34, Name: "Tritanium", Purchasing: map[string]Purchase{"p-1": {ID: "p-1"}}},
			},
			ExtrasCosts: map[string]ExtraCost{"e-1": {ID: "e-1", ExtraValue: 10}},
			ChildJobs:   map[string][]string{"34": {"job-7"}},
		},
		ESI: JobESI{
			LinkedJobs:   map[string]LinkedESIJob{"500001": {JobID: 500001, CharacterID: 99, CharacterRef: "ref-99"}},
			MarketOrders: map[string]MarketOrder{"700001": {Duration: 90, CharacterRef: "ref-99", CorporationRef: "ref-5"}},
		},
	}
}

func setPaths(t *testing.T, document string, job *Job) map[string]any {
	t.Helper()
	set, err := JobSetPaths(jsontext.Value(document), job)
	if err != nil {
		t.Fatalf("JobSetPaths: %v", err)
	}
	return set
}

func TestJobSetPathsCarriesOnlyWhatWasPresent(t *testing.T) {
	set := setPaths(t, `{"name":"A job"}`, writeJob())

	if len(set) != 1 {
		t.Fatalf("want one path, got %v", set)
	}
	if set["name"] != "A job" {
		t.Errorf("want the name at `name`, got %v", set)
	}
}

func TestJobSetPathsReachesTheDeepestPresentField(t *testing.T) {
	set := setPaths(t, `{"build":{"materials":{"34":{"typeID":34}}}}`, writeJob())

	if _, ok := set["build.materials.34.typeID"]; !ok {
		t.Fatalf("want the deepest path, got %v", set)
	}
}

// An empty object is a collection being set to empty, not a path to walk into.
func TestJobSetPathsWritesAnEmptiedCollection(t *testing.T) {
	job := writeJob()
	job.Build.ExtrasCosts = map[string]ExtraCost{}

	set := setPaths(t, `{"build":{"extrasCosts":{}}}`, job)

	value, ok := set["build.extrasCosts"]
	if !ok {
		t.Fatalf("want the collection written, got %v", set)
	}
	if rows, ok := value.(map[string]ExtraCost); !ok || len(rows) != 0 {
		t.Errorf("want an empty collection, got %v", value)
	}
}

// A list is a value, not a path: it is written whole however deep it sits.
func TestJobSetPathsWritesAListWhole(t *testing.T) {
	set := setPaths(t, `{"build":{"childJobs":{"34":["job-7"]}}}`, writeJob())

	if _, ok := set["build.childJobs.34"]; !ok {
		t.Fatalf("want the list written whole, got %v", set)
	}
}

// The stored name is the bson tag's, which is not always the json name.
func TestJobSetPathsWritesTheRowWhenAFieldHasNoStoredPath(t *testing.T) {
	set := setPaths(t, `{"esi":{"industryJobs":{"500001":{"character_id":99}}}}`, writeJob())

	value, ok := set["esi.industryJobs.500001"]
	if !ok {
		t.Fatalf("want the row written, got %v", set)
	}
	run, ok := value.(LinkedESIJob)
	if !ok {
		t.Fatalf("want the decoded row, got %T", value)
	}
	// The row is written as the handler left it, so the ciphered ref travels and
	// the client-facing id has no path to be written at.
	if run.CharacterRef != "ref-99" {
		t.Errorf("want the ciphered ref carried, got %q", run.CharacterRef)
	}
	if _, named := set["esi.industryJobs.500001.character_id"]; named {
		t.Errorf("character_id has no stored path and must not be written at one")
	}
}

// Every linked run, order and transaction carries a ciphered id beside ordinary
// fields, so this is the common shape rather than an edge case. The row is the
// unit either way, and which member the walk reads first must not decide it.
func TestJobSetPathsWritesTheRowOnceWhenACipheredFieldHasASibling(t *testing.T) {
	// One sibling either side of `character_id` by name, so the row is the answer
	// whichever member the walk reaches first.
	set := setPaths(t, `{"esi":{"industryJobs":{"500001":{"blueprint_id":7,"character_id":99,"job_id":500001}}}}`, writeJob())

	if len(set) != 1 {
		t.Fatalf("want the row alone, got %v", set)
	}
	if _, ok := set["esi.industryJobs.500001"]; !ok {
		t.Fatalf("want the row written, got %v", set)
	}
}

// A market order and a transaction each carry two fields with no stored path,
// so the row has to be the answer once rather than once per such field.
func TestJobSetPathsWritesTheRowOnceForTwoCipheredFields(t *testing.T) {
	set := setPaths(t, `{"esi":{"marketOrders":{"700001":{"character_id":99,"corporation_id":5,"duration":90}}}}`, writeJob())

	if len(set) != 1 {
		t.Fatalf("want the row alone, got %v", set)
	}
	order, ok := set["esi.marketOrders.700001"].(MarketOrder)
	if !ok {
		t.Fatalf("want the decoded row, got %T", set["esi.marketOrders.700001"])
	}
	if order.CharacterRef != "ref-99" || order.CorporationRef != "ref-5" {
		t.Errorf("want both ciphered refs carried, got %q and %q", order.CharacterRef, order.CorporationRef)
	}
}

func TestJobSetPathsRefusesABodyThatIsNotADocument(t *testing.T) {
	for _, body := range []string{`[]`, `"a job"`, `7`} {
		if _, err := JobSetPaths(jsontext.Value(body), writeJob()); err == nil {
			t.Errorf("want %s refused", body)
		}
	}
}

func TestJobSetPathsRefusesMeta(t *testing.T) {
	_, err := JobSetPaths(jsontext.Value(`{"_meta":{"revision":9}}`), writeJob())
	if err == nil || !strings.Contains(err.Error(), "_meta") {
		t.Fatalf("want _meta refused, got %v", err)
	}
}

func TestJobSetPathsRefusesAFieldTheModelDoesNotCarry(t *testing.T) {
	_, err := JobSetPaths(jsontext.Value(`{"somethingElse":1}`), writeJob())
	if err == nil || !strings.Contains(err.Error(), "somethingElse") {
		t.Fatalf("want an unknown field refused, got %v", err)
	}
}

// A body whose shape disagrees with the model is refused rather than half
// written: there is nothing under a name that holds no members.
func TestJobSetPathsRefusesAnObjectAgainstAPlainField(t *testing.T) {
	_, err := JobSetPaths(jsontext.Value(`{"name":{"first":"A job"}}`), writeJob())
	if err == nil || !strings.Contains(err.Error(), "cannot reach into") {
		t.Fatalf("want an object against a plain field refused, got %v", err)
	}
}

func TestJobUnsetPathsResolvesARowToItsStoredPath(t *testing.T) {
	paths, err := JobUnsetPaths([][]string{
		{"esi", "industryJobs", "500001"},
		{"build", "materials", "34", "purchasing", "p-1"},
	})
	if err != nil {
		t.Fatalf("JobUnsetPaths: %v", err)
	}
	want := []string{"esi.industryJobs.500001", "build.materials.34.purchasing.p-1"}
	for i, path := range want {
		if paths[i] != path {
			t.Errorf("want %q, got %q", path, paths[i])
		}
	}
}

// Only a row of a keyed collection can be cleared on its own: a struct field is
// part of the job's shape, and a job missing one cannot be read back.
func TestJobUnsetPathsRefusesAFieldThatIsNotARow(t *testing.T) {
	for _, path := range [][]string{
		{"build"},
		{"build", "materials", "34", "typeID"},
		{"name"},
	} {
		if _, err := JobUnsetPaths([][]string{path}); err == nil {
			t.Errorf("want %v refused", path)
		}
	}
}

func TestJobUnsetPathsRefusesWhatLeavesTheModel(t *testing.T) {
	for _, path := range [][]string{
		{"_meta", "revision"},
		{"build", "somethingElse", "x"},
		{"name", "x"},
	} {
		if _, err := JobUnsetPaths([][]string{path}); err == nil {
			t.Errorf("want %v refused", path)
		}
	}
}

// A list row cannot be cleared by path — $unset leaves a hole where it was — so
// the client writes the list whole and the server refuses to be asked otherwise.
func TestJobUnsetPathsRefusesAListRow(t *testing.T) {
	if _, err := JobUnsetPaths([][]string{{"build", "childJobs", "34", "0"}}); err == nil {
		t.Error("want a list row refused")
	}
	if _, err := JobUnsetPaths([][]string{{"parentJobs", "0"}}); err == nil {
		t.Error("want a parent job row refused")
	}
}
