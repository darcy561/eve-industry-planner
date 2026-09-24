package modelparity

import (
	"encoding/json"
	"os"
	"reflect"
	"slices"
	"strings"
	"testing"

	"eve-industry-planner/shared/models"
)

// The SPA parity test reads this file to tell a field the model left out under
// omitempty from one it has no field for at all. It is committed rather than
// written beside a corpus because the SPA cannot produce it — the paths come
// from Go reflection — so a file only written when the sweep runs goes stale the
// moment the model gains a field, and the SPA test then reports that field as
// unmodelled. It did: `build.sale.plan` and `layout.localPricing` were read as
// faults for as long as the schema predated them.
const schemaFixture = "../../fixtures/model-parity/job-schema.json"

// TestRegenerateJobSchema rewrites the committed census from the model. It is
// how the failure below is answered, and it is gated so an ordinary run never
// rewrites what it is meant to be checking:
//
//	EIP_REGEN_JOB_SCHEMA=1 go test ./model_parity/lib -run TestRegenerateJobSchema
func TestRegenerateJobSchema(t *testing.T) {
	if os.Getenv("EIP_REGEN_JOB_SCHEMA") == "" {
		t.Skip("set EIP_REGEN_JOB_SCHEMA=1 to rewrite the fixture from the model")
	}
	// The same writer the live sweep uses for the schema beside its corpus, so
	// the committed census and a swept one cannot be written differently.
	if err := WriteSchema(reflect.TypeFor[models.Job](), schemaFixture); err != nil {
		t.Fatalf("write the census: %v", err)
	}
	t.Logf("wrote the census to %s", schemaFixture)
}

func TestJobSchemaFixtureMatchesTheModel(t *testing.T) {
	t.Parallel()

	raw, err := os.ReadFile(schemaFixture)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var committed []string
	if err := json.Unmarshal(raw, &committed); err != nil {
		t.Fatalf("parse fixture: %v", err)
	}

	current := JSONPaths(reflect.TypeFor[models.Job]())
	slices.Sort(committed)
	slices.Sort(current)

	if slices.Equal(committed, current) {
		return
	}

	var added, gone []string
	for _, p := range current {
		if !slices.Contains(committed, p) {
			added = append(added, p)
		}
	}
	for _, p := range committed {
		if !slices.Contains(current, p) {
			gone = append(gone, p)
		}
	}
	t.Fatalf("the committed schema no longer matches models.Job.\n"+
		"  the model gained: %s\n  the model lost:   %s\n\n"+
		"Regenerate it, or the SPA parity test reports the model's own fields as unmodelled.",
		strings.Join(added, ", "), strings.Join(gone, ", "))
}
