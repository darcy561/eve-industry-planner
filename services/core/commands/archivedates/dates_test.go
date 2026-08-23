package archivedates

import (
	"testing"
	"time"
)

// The file is embedded, so a malformed entry is a runtime failure inside a
// migration rather than a build error. Parsing it here turns that into a test.
func TestEmbeddedDatesParse(t *testing.T) {
	t.Parallel()

	n, err := Count()
	if err != nil {
		t.Fatalf("embedded archive dates do not parse: %v", err)
	}
	if n == 0 {
		t.Fatal("no archive dates embedded; the backfill would silently date nothing")
	}
}

// Every recovered date comes from a Firestore deployment that stopped taking
// writes at the migration, so a date outside that window means the export picked
// up the wrong field.
func TestDatesFallInTheFirestoreEra(t *testing.T) {
	t.Parallel()

	dates, err := load()
	if err != nil {
		t.Fatal(err)
	}

	earliest := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
	latest := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)

	for jobID, at := range dates {
		if at.Before(earliest) || at.After(latest) {
			t.Fatalf("job %s has a recovered date outside the Firestore era: %v", jobID, at)
		}
		if at.Location() != time.UTC {
			t.Fatalf("job %s has a non-UTC date: %v", jobID, at)
		}
	}
}

func TestLookupFindsAnEmbeddedJobAndMissesOthers(t *testing.T) {
	t.Parallel()

	dates, err := load()
	if err != nil {
		t.Fatal(err)
	}

	var sampleID string
	for jobID := range dates {
		sampleID = jobID
		break
	}

	got, ok, err := Lookup(sampleID)
	if err != nil || !ok {
		t.Fatalf("Lookup(%q) = %v, %v; want a date", sampleID, got, ok)
	}
	if got.IsZero() {
		t.Fatal("Lookup returned a zero date alongside ok=true")
	}

	if _, ok, err := Lookup("job-that-was-never-in-firestore"); err != nil || ok {
		t.Fatalf("Lookup of an unknown job = ok %v, err %v; want no match", ok, err)
	}
}
