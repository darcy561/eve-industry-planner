package models

import (
	"os"
	"regexp"
	"strconv"
	"testing"
)

// The SPA mints invention entries and the backend reads them, so both sides
// carry the version a row written today has. One number in two languages goes
// out of step silently — the rows keep being written, just claiming a shape
// nobody bumped — so the copies are held together here rather than by a comment
// asking the next person to remember.
const spaInventionEntry = "../../../frontend/src/Classes/inventionEntry.js"

var spaSchemaCurrent = regexp.MustCompile(`static SCHEMA_CURRENT = (\d+);`)

func TestInventionEntrySchemaCurrentMatchesTheSPA(t *testing.T) {
	t.Parallel()

	source, err := os.ReadFile(spaInventionEntry)
	if err != nil {
		t.Fatalf("read %s: %v", spaInventionEntry, err)
	}

	match := spaSchemaCurrent.FindSubmatch(source)
	if match == nil {
		t.Fatalf("%s declares no `static SCHEMA_CURRENT = <n>;`, so nothing holds the two sides together", spaInventionEntry)
	}
	spa, err := strconv.Atoi(string(match[1]))
	if err != nil {
		t.Fatalf("SPA SCHEMA_CURRENT is not a number: %v", err)
	}

	if spa != InventionEntrySchemaCurrent {
		t.Errorf("SPA writes invention entries at v%d, models.InventionEntrySchemaCurrent is %d",
			spa, InventionEntrySchemaCurrent)
	}
}
