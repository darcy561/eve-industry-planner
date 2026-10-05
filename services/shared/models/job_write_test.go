package models

import (
	"strings"
	"testing"

	"encoding/json/jsontext"

	"eve-industry-planner/shared/jsoncodec"

	"go.mongodb.org/mongo-driver/v2/bson"
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

func TestJobSetPathsWritesAListWhole(t *testing.T) {
	set := setPaths(t, `{"build":{"childJobs":{"34":["job-7"]}}}`, writeJob())

	if _, ok := set["build.childJobs.34"]; !ok {
		t.Fatalf("want the list written whole, got %v", set)
	}
}

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
	if run.CharacterRef != "ref-99" {
		t.Errorf("want the ciphered ref carried, got %q", run.CharacterRef)
	}
	if _, named := set["esi.industryJobs.500001.character_id"]; named {
		t.Errorf("character_id has no stored path and must not be written at one")
	}
}

func TestJobSetPathsWritesTheRowOnceWhenACipheredFieldHasASibling(t *testing.T) {
	set := setPaths(t, `{"esi":{"industryJobs":{"500001":{"blueprint_id":7,"character_id":99,"job_id":500001}}}}`, writeJob())

	if len(set) != 1 {
		t.Fatalf("want the row alone, got %v", set)
	}
	if _, ok := set["esi.industryJobs.500001"]; !ok {
		t.Fatalf("want the row written, got %v", set)
	}
}

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

func TestJobWritePathsRefuseAKeyThatCannotBeAStep(t *testing.T) {
	for _, path := range [][]string{
		{"esi", "industryJobs", ""},
		{"esi", "industryJobs", "500001.job_id"},
		{"build", "materials", "34", "purchasing", ""},
	} {
		if _, err := JobUnsetPaths([][]string{path}); err == nil {
			t.Errorf("want %v refused", path)
		}
	}

	for _, body := range []string{
		`{"esi":{"industryJobs":{"":{"job_id":1}}}}`,
		`{"esi":{"industryJobs":{"500001.job_id":{"job_id":1}}}}`,
	} {
		if _, err := JobSetPaths(jsontext.Value(body), writeJob()); err == nil {
			t.Errorf("want %s refused", body)
		}
	}
}

func TestJobUnsetPathsRefusesAListRow(t *testing.T) {
	if _, err := JobUnsetPaths([][]string{{"build", "childJobs", "34", "0"}}); err == nil {
		t.Error("want a list row refused")
	}
	if _, err := JobUnsetPaths([][]string{{"parentJobs", "0"}}); err == nil {
		t.Error("want a parent job row refused")
	}
}

func TestJobWriteBodyValidateRefusesWhatCannotBeWritten(t *testing.T) {
	for name, body := range map[string]JobWriteBody{
		"no job":      {Revision: 4, Document: jsontext.Value(`{}`)},
		"no document": {JobID: "job-1", Revision: 4},
		"a revision below zero": {
			JobID: "job-1", Revision: -1, Document: jsontext.Value(`{}`),
		},
	} {
		if err := body.Validate(); err == nil {
			t.Errorf("want %s refused", name)
		}
	}
}

func TestJobWriteBodyValidateAllowsAWriteThatNamesEverything(t *testing.T) {
	body := JobWriteBody{JobID: "job-1", Revision: 4, Document: jsontext.Value(`{"name":"A job"}`)}

	if err := body.Validate(); err != nil {
		t.Fatalf("want the write allowed, got %v", err)
	}
}

func TestJobWriteBodyIsWholeDocumentWhenTheEnvelopeNamesNoRevision(t *testing.T) {
	if !(JobWriteBody{JobID: "job-1"}).IsWholeDocument() {
		t.Error("want a write naming no revision carried whole")
	}
	if (JobWriteBody{JobID: "job-1", Revision: 1}).IsWholeDocument() {
		t.Error("want a write naming a revision carried by field")
	}
}

func TestJobWriteBodyDecodesTheEnvelopeBesideTheDocument(t *testing.T) {
	var body JobWriteBody
	raw := `{"jobID":"job-1","revision":4,"document":{"name":"A job"},"removed":[["esi","industryJobs","500001"]]}`
	if err := jsoncodec.Unmarshal([]byte(raw), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}

	if body.JobID != "job-1" || body.Revision != 4 {
		t.Errorf("want the job and revision beside the document, got %+v", body)
	}
	set, err := JobSetPaths(body.Document, writeJob())
	if err != nil {
		t.Fatalf("JobSetPaths: %v", err)
	}
	if set["name"] != "A job" {
		t.Errorf("want the document still walkable, got %v", set)
	}
	if len(body.Removed) != 1 || body.Removed[0][2] != "500001" {
		t.Errorf("want the removed row carried, got %v", body.Removed)
	}
}

func changesFor(t *testing.T, updated map[string]any) map[string]any {
	t.Helper()
	changes, err := JobJSONChanges(updated)
	if err != nil {
		t.Fatalf("JobJSONChanges: %v", err)
	}
	byPath := make(map[string]any, len(changes))
	for _, change := range changes {
		byPath[strings.Join(change.Path, ".")] = change.Value
	}
	return byPath
}

func valueAt(t *testing.T, value any, path ...string) any {
	t.Helper()
	held := value
	for _, step := range path {
		inner, ok := held.(map[string]any)
		if !ok {
			t.Fatalf("nothing to step into at %q in %v", step, value)
		}
		if held, ok = inner[step]; !ok {
			t.Fatalf("no %q in %v", step, value)
		}
	}
	return held
}

func TestJobJSONChangesCarriesAPlainField(t *testing.T) {
	changes := changesFor(t, map[string]any{"name": "A job"})

	if changes["name"] != "A job" {
		t.Errorf("want the name at its path, got %v", changes)
	}
}

func TestJobJSONChangesKeepsThePathMongoReportedRatherThanNesting(t *testing.T) {
	changes := changesFor(t, map[string]any{"build.materials.34.typeID": 34})

	if len(changes) != 1 || changes["build.materials.34.typeID"] != 34 {
		t.Errorf("want one change at the reported path, got %v", changes)
	}
}

func TestJobJSONChangesCarriesAnEmptiedCollectionAsTheValueThatReplacesIt(t *testing.T) {
	changes := changesFor(t, map[string]any{"build.extrasCosts": bson.M{}})

	held, ok := changes["build.extrasCosts"].(map[string]any)
	if !ok || len(held) != 0 {
		t.Errorf("want an empty collection at build.extrasCosts, got %v", changes)
	}
}

func TestJobJSONChangesRenamesInsideARowWrittenWhole(t *testing.T) {
	changes := changesFor(t, map[string]any{
		"build.materials.34": bson.M{
			"typeID":     34,
			"purchasing": bson.M{"p-1": bson.M{"id": "p-1", "itemCount": 60}},
		},
	})

	if valueAt(t, changes["build.materials.34"], "purchasing", "p-1", "itemCount") != 60 {
		t.Errorf("want the row's own keys converted, got %v", changes)
	}
}

func TestJobJSONChangesKeepsARefInsideARowWrittenWhole(t *testing.T) {
	changes := changesFor(t, map[string]any{
		"esi.marketOrders.700001": bson.D{
			{Key: "duration", Value: 90},
			{Key: "corporation_ref", Value: "ref-5"},
		},
	})

	if valueAt(t, changes["esi.marketOrders.700001"], "corporation_ref") != "ref-5" {
		t.Errorf("want the ref kept inside the row for the id restore, got %v", changes)
	}
}

func TestJobJSONChangesRefusesARefSetOnItsOwn(t *testing.T) {
	if _, err := JobJSONChanges(map[string]any{"esi.marketOrders.700001.corporation_ref": "ref-5"}); err == nil {
		t.Fatal("want a ref set on its own refused, because nothing would restore it")
	}
}

func TestJobJSONRemovedRefusesARefClearedOnItsOwn(t *testing.T) {
	if _, err := JobJSONRemoved([]string{"esi.marketOrders.700001.corporation_ref"}); err == nil {
		t.Fatal("want a ref cleared on its own refused, because the client would keep its id")
	}
}

func TestJobJSONChangesDropsAFieldAClientIsNeverSent(t *testing.T) {
	changes := changesFor(t, map[string]any{
		"protected":      bson.M{"fields": bson.A{"name"}},
		"_meta.owner":    bson.M{"kind": "account"},
		"_meta.revision": int64(8),
	})

	if _, held := changes["protected"]; held {
		t.Errorf("want protected dropped, got %v", changes)
	}
	if _, held := changes["_meta.owner"]; held {
		t.Errorf("want the owner dropped, got %v", changes)
	}
	if changes["_meta.revision"] != int64(8) {
		t.Errorf("want the revision kept, got %v", changes)
	}
}

func TestJobJSONChangesDropsAnUnsentFieldInsideADocumentWrittenWhole(t *testing.T) {
	changes := changesFor(t, map[string]any{
		"_meta": bson.M{"owner": bson.M{"kind": "account"}, "revision": int64(8)},
	})

	meta, ok := changes["_meta"].(map[string]any)
	if !ok {
		t.Fatalf("want _meta carried, got %v", changes)
	}
	if _, held := meta["owner"]; held {
		t.Errorf("want the owner dropped inside _meta, got %v", meta)
	}
	if meta["revision"] != int64(8) {
		t.Errorf("want the revision kept beside it, got %v", meta)
	}
}

func TestJobJSONChangesCarriesAListHeldUnderARowKey(t *testing.T) {
	changes := changesFor(t, map[string]any{"build.childJobs.34": bson.A{"job-7", "job-8"}})

	held, ok := changes["build.childJobs.34"].([]any)
	if !ok || len(held) != 2 || held[0] != "job-7" {
		t.Errorf("want the list under its row key, got %v", changes)
	}
}

func TestJobJSONChangesCarriesANullWhereAMapOrListWasStoredEmpty(t *testing.T) {
	changes := changesFor(t, map[string]any{
		"build.materials":    nil,
		"build.childJobs.34": nil,
	})

	if held, ok := changes["build.materials"]; !ok || held != nil {
		t.Errorf("want a null map carried as null, got %v", changes)
	}
	if held, ok := changes["build.childJobs.34"]; !ok || held != nil {
		t.Errorf("want a null list carried as null, got %v", changes)
	}
}

func TestJobJSONChangesRefusesAPositionalPath(t *testing.T) {
	if _, err := JobJSONChanges(map[string]any{"parentJobs.0": "job-7"}); err == nil {
		t.Fatal("want a positional path refused")
	}
}

func TestJobJSONChangesRefusesAPathTheModelDoesNotStore(t *testing.T) {
	if _, err := JobJSONChanges(map[string]any{"build.nonsense": 1}); err == nil {
		t.Fatal("want an unknown stored field refused")
	}
}

func TestJobJSONChangesRefusesAPathThroughAFieldWithNothingInside(t *testing.T) {
	if _, err := JobJSONChanges(map[string]any{"build.materials.34.typeID.deeper": 1}); err == nil {
		t.Fatal("want a path through a plain field refused")
	}
}

func TestJobJSONChangesRefusesAnUnknownFieldInsideARowWrittenWhole(t *testing.T) {
	if _, err := JobJSONChanges(map[string]any{
		"build.materials.34": bson.M{"typeID": 34, "nonsense": 1},
	}); err == nil {
		t.Fatal("want a row carrying a field the model does not store refused, never sent partial")
	}
}

func TestJobJSONChangesRefusesAnUnknownFieldInsideAListOfRows(t *testing.T) {
	if _, err := JobJSONChanges(map[string]any{
		"rawData.materials": bson.A{bson.M{"typeID": 34, "nonsense": 1}},
	}); err == nil {
		t.Fatal("want a list whose row carries an unknown field refused")
	}
}

func TestJobJSONChangesRefusesARowKeyInsideAValueThatCannotBeAPath(t *testing.T) {
	if _, err := JobJSONChanges(map[string]any{
		"build.materials": bson.M{"3.4": bson.M{"typeID": 34}},
	}); err == nil {
		t.Fatal("want a row key holding a dot refused")
	}
}

func TestJobJSONRemovedNamesTheRowAClientDeletes(t *testing.T) {
	paths, err := JobJSONRemoved([]string{"build.extrasCosts.e-1"})
	if err != nil {
		t.Fatalf("JobJSONRemoved: %v", err)
	}
	if len(paths) != 1 || strings.Join(paths[0], ".") != "build.extrasCosts.e-1" {
		t.Errorf("want the row path, got %v", paths)
	}
}

func TestJobJSONRemovedDropsWhatAClientIsNeverSent(t *testing.T) {
	paths, err := JobJSONRemoved([]string{"protected"})
	if err != nil {
		t.Fatalf("JobJSONRemoved: %v", err)
	}
	if len(paths) != 0 {
		t.Errorf("want nothing to delete, got %v", paths)
	}
}

func TestJobJSONRemovedNamesAListHeldUnderARowKey(t *testing.T) {
	paths, err := JobJSONRemoved([]string{"build.childJobs.34"})
	if err != nil {
		t.Fatalf("JobJSONRemoved: %v", err)
	}
	if len(paths) != 1 || strings.Join(paths[0], ".") != "build.childJobs.34" {
		t.Errorf("want the row path, got %v", paths)
	}
}

func aWrite(jobID string) JobWriteBody {
	return JobWriteBody{JobID: jobID, Revision: 2, Document: jsontext.Value(`{"name":"renamed"}`)}
}

func TestJobWriteBatchRefusesDeletesOutsideOneChange(t *testing.T) {
	batch := JobWriteBatch{Jobs: []JobWriteBody{aWrite("kept")}, Deletes: []JobDeleteBody{{JobID: "gone", Revision: 3}}}
	if err := batch.Validate(); err == nil {
		t.Fatal("a batch not marked as one change was allowed to remove jobs")
	}
}

func TestJobWriteBatchRefusesAJobBothWrittenAndRemoved(t *testing.T) {
	batch := JobWriteBatch{Jobs: []JobWriteBody{aWrite("both")}, Deletes: []JobDeleteBody{{JobID: "both", Revision: 3}}, OneChange: true}
	if err := batch.Validate(); err == nil {
		t.Fatal("a job both written and removed was allowed")
	}
}

func TestJobWriteBatchRefusesARemovalWithoutItsRevision(t *testing.T) {
	for _, remove := range []JobDeleteBody{{JobID: "gone"}, {Revision: 3}} {
		batch := JobWriteBatch{Deletes: []JobDeleteBody{remove}, OneChange: true}
		if err := batch.Validate(); err == nil {
			t.Errorf("removal %+v was allowed", remove)
		}
	}
}

func TestJobWriteBatchRefusesAnEmptyBatch(t *testing.T) {
	if err := (JobWriteBatch{OneChange: true}).Validate(); err == nil {
		t.Fatal("a batch carrying nothing was allowed")
	}
}

func TestJobWriteBatchAllowsAChangeThatOnlyRemoves(t *testing.T) {
	batch := JobWriteBatch{Deletes: []JobDeleteBody{{JobID: "gone", Revision: 3}}, OneChange: true}
	if err := batch.Validate(); err != nil {
		t.Fatalf("a change that only removes was refused: %v", err)
	}
}

func TestJobWriteBatchNamesEveryJobItTouches(t *testing.T) {
	batch := JobWriteBatch{
		Jobs:      []JobWriteBody{aWrite("written")},
		Deletes:   []JobDeleteBody{{JobID: "removed", Revision: 3}},
		OneChange: true,
	}
	if got := strings.Join(batch.JobIDs(), ","); got != "written,removed" {
		t.Fatalf("JobIDs = %s, want written,removed", got)
	}
}
