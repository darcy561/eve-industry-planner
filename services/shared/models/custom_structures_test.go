package models

import (
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// decodeSettings round-trips a raw stored document through the decoder, which is
// where the fold happens.
func decodeSettings(t *testing.T, stored bson.M) CustomStructures {
	t.Helper()
	raw, err := bson.Marshal(bson.M{"customStructures": stored["customStructures"]})
	if err != nil {
		t.Fatalf("marshal stored document: %v", err)
	}
	var doc struct {
		CustomStructures CustomStructures `bson:"customStructures"`
	}
	if err := bson.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("decode stored document: %v", err)
	}
	return doc.CustomStructures
}

func TestCustomStructuresFoldsTheStoredLanes(t *testing.T) {
	got := decodeSettings(t, bson.M{"customStructures": bson.M{
		"manufacturing": []bson.M{{"id": "manStruct-1", "name": "Sotiyo"}},
		"reaction":      []bson.M{{"id": "reacStruct-1", "name": "Tatara"}},
		"reprocessing":  []bson.M{{"id": "reprocessingStruct-1", "name": "Athanor", "rigSlot1": 7, "implant": 3}},
		"invention":     []bson.M{{"id": "inventionStruct-1", "name": "Raitaru", "rigSlot1": 9}},
	}})

	if len(got) != 4 {
		t.Fatalf("folded %d rows, want 4: %+v", len(got), got)
	}

	byID := map[string]CustomStructure{}
	for _, row := range got {
		byID[row.ID] = row
	}
	for id, wantJobType := range map[string]int{
		"manStruct-1":          JobTypeManufacturing,
		"reacStruct-1":         JobTypeReaction,
		"reprocessingStruct-1": JobTypeReprocessing,
		"inventionStruct-1":    JobTypeInvention,
	} {
		row, ok := byID[id]
		if !ok {
			t.Fatalf("row %q was lost in the fold", id)
		}
		if row.JobType != wantJobType {
			t.Errorf("row %q jobType = %d, want %d", id, row.JobType, wantJobType)
		}
	}

	// The fields each kind uses survive the fold onto one shape.
	if got := byID["reprocessingStruct-1"]; got.RigSlot1 != 7 || got.Implant != 3 {
		t.Errorf("reprocessing row lost its fields: %+v", got)
	}
	if got := byID["inventionStruct-1"]; got.RigSlot1 != 9 {
		t.Errorf("invention row lost its rig: %+v", got)
	}
}

func TestCustomStructuresKeepsAJobTypeTheRowAlreadyNames(t *testing.T) {
	// A row's own jobType wins over the lane it sits in: the row is the thing
	// that says what it is, and a misfiled row must not be relabelled by where
	// it was found.
	got := decodeSettings(t, bson.M{"customStructures": bson.M{
		"manufacturing": []bson.M{{"id": "s-1", "jobType": JobTypeReaction}},
	}})
	if len(got) != 1 {
		t.Fatalf("folded %d rows, want 1", len(got))
	}
	if got[0].JobType != JobTypeReaction {
		t.Errorf("jobType = %d, want the row's own %d", got[0].JobType, JobTypeReaction)
	}
}

func TestCustomStructuresReadsTheFoldedArray(t *testing.T) {
	got := decodeSettings(t, bson.M{"customStructures": []bson.M{
		{"id": "manStruct-1", "jobType": JobTypeManufacturing, "name": "Sotiyo"},
		{"id": "reprocessingStruct-1", "jobType": JobTypeReprocessing, "rigSlot1": 7},
	}})
	if len(got) != 2 {
		t.Fatalf("read %d rows, want 2: %+v", len(got), got)
	}
	if got[0].ID != "manStruct-1" || got[1].RigSlot1 != 7 {
		t.Errorf("rows did not survive the read: %+v", got)
	}
}

func TestCustomStructuresFoldIsIdempotent(t *testing.T) {
	lanes := bson.M{"customStructures": bson.M{
		"manufacturing": []bson.M{{"id": "manStruct-1", "name": "Sotiyo"}},
		"reprocessing":  []bson.M{{"id": "reprocessingStruct-1", "rigSlot1": 7}},
	}}
	once := decodeSettings(t, lanes)

	// Write what the fold produced back out and read it again: the second read is
	// the array branch, and must land on the same rows.
	raw, err := bson.Marshal(bson.M{"customStructures": once})
	if err != nil {
		t.Fatalf("marshal folded: %v", err)
	}
	var doc struct {
		CustomStructures CustomStructures `bson:"customStructures"`
	}
	if err := bson.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("re-read folded: %v", err)
	}
	twice := doc.CustomStructures

	if len(twice) != len(once) {
		t.Fatalf("second read gave %d rows, first gave %d", len(twice), len(once))
	}
	for i := range once {
		if once[i] != twice[i] {
			t.Errorf("row %d changed on the second read:\n once: %+v\ntwice: %+v", i, once[i], twice[i])
		}
	}
}

func TestCustomStructuresReadsAnAbsentOrEmptyValue(t *testing.T) {
	for name, stored := range map[string]any{
		"empty array": []bson.M{},
		"empty lanes": bson.M{},
		"absent lane": bson.M{"manufacturing": []bson.M{}},
	} {
		t.Run(name, func(t *testing.T) {
			if got := decodeSettings(t, bson.M{"customStructures": stored}); len(got) != 0 {
				t.Errorf("read %d rows, want none: %+v", len(got), got)
			}
		})
	}
}

func TestCustomStructuresOfJobTypeFiltersByKind(t *testing.T) {
	structures := CustomStructures{
		{ID: "a", JobType: JobTypeManufacturing},
		{ID: "b", JobType: JobTypeReprocessing},
		{ID: "c", JobType: JobTypeManufacturing},
	}
	got := structures.OfJobType(JobTypeManufacturing)
	if len(got) != 2 || got[0].ID != "a" || got[1].ID != "c" {
		t.Errorf("OfJobType = %+v, want a and c in stored order", got)
	}
	if got := structures.OfJobType(JobTypeInvention); got != nil {
		t.Errorf("OfJobType for a kind with none = %+v, want nil", got)
	}
}

func TestCustomStructuresDefaultOfJobType(t *testing.T) {
	structures := CustomStructures{
		{ID: "a", JobType: JobTypeManufacturing},
		{ID: "b", JobType: JobTypeManufacturing, Default: true},
		{ID: "c", JobType: JobTypeReprocessing},
	}
	if got := structures.DefaultOfJobType(JobTypeManufacturing); got == nil || got.ID != "b" {
		t.Errorf("DefaultOfJobType = %+v, want the flagged row b", got)
	}
	// No row flagged: the first configured stands in, as the SPA has always done.
	if got := structures.DefaultOfJobType(JobTypeReprocessing); got == nil || got.ID != "c" {
		t.Errorf("DefaultOfJobType with nothing flagged = %+v, want first row c", got)
	}
	if got := structures.DefaultOfJobType(JobTypeInvention); got != nil {
		t.Errorf("DefaultOfJobType for a kind with none = %+v, want nil", got)
	}
}

func TestCustomStructuresWithID(t *testing.T) {
	structures := CustomStructures{
		{ID: "a", JobType: JobTypeManufacturing},
		{ID: "b", JobType: JobTypeReprocessing},
	}
	// Found without being told which kind to look under: the point of one array.
	if got := structures.WithID("b"); got == nil || got.JobType != JobTypeReprocessing {
		t.Errorf("WithID(b) = %+v, want the reprocessing row", got)
	}
	if got := structures.WithID("missing"); got != nil {
		t.Errorf("WithID for an unknown id = %+v, want nil", got)
	}
}

func TestCustomStructuresRoundTripsWithNoStructures(t *testing.T) {
	// An account with no structures configured is the common case on a new
	// document, and it has to survive a write and a read. A nil slice is stored
	// as null, which is neither shape the fold reads, so the read absorbs it.
	var doc struct {
		CustomStructures CustomStructures `bson:"customStructures"`
	}
	encoded, err := bson.Marshal(doc)
	if err != nil {
		t.Fatalf("marshal empty: %v", err)
	}

	var back struct {
		CustomStructures CustomStructures `bson:"customStructures"`
	}
	if err := bson.Unmarshal(encoded, &back); err != nil {
		t.Fatalf("read back an empty configuration: %v", err)
	}
	if len(back.CustomStructures) != 0 {
		t.Errorf("read %d rows, want none", len(back.CustomStructures))
	}
}

func TestCustomStructuresReadsAStoredNull(t *testing.T) {
	// Documents already carry null here, written before an empty configuration
	// was stored as an array.
	encoded, err := bson.Marshal(bson.M{"customStructures": nil})
	if err != nil {
		t.Fatalf("marshal null: %v", err)
	}
	var doc struct {
		CustomStructures CustomStructures `bson:"customStructures"`
	}
	if err := bson.Unmarshal(encoded, &doc); err != nil {
		t.Fatalf("read a stored null: %v", err)
	}
	if len(doc.CustomStructures) != 0 {
		t.Errorf("read %d rows from null, want none", len(doc.CustomStructures))
	}
}
