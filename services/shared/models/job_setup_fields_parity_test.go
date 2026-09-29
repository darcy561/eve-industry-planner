package models

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
)

const setupFieldsPath = "../../../testing/fixtures/job-setup-fields/fields.json"

const regenerateSetupFields = "EIP_UPDATE_JOB_SETUP_FIELDS=1 go test ./shared/models/ -run TestTheJobSetupFieldListIsCurrent"

const setupFieldsWhy = "Every field a stored job setup carries, as the server " +
	"names it. An incremental job write resolves each member of the body " +
	"against this struct and fails the whole write when one has no field " +
	"here, so a key the SPA writes and the server does not declare drops the " +
	"save silently. Regenerate with: " + regenerateSetupFields

// jobSetupFieldList is keyed by the json name, which is what a stored document
// and the SPA both use.
type jobSetupFieldList struct {
	Why      string   `json:"why"`
	Always   []string `json:"always"`
	Optional []string `json:"optional"`
}

func currentJobSetupFields() jobSetupFieldList {
	held := reflect.TypeFor[JobSetup]()
	fields := jobSetupFieldList{Why: setupFieldsWhy, Always: []string{}, Optional: []string{}}

	for field := range held.Fields() {
		name, options, _ := strings.Cut(field.Tag.Get("json"), ",")
		if name == "" || name == "-" {
			continue
		}
		if strings.Contains(options, "omitempty") || strings.Contains(options, "omitzero") {
			fields.Optional = append(fields.Optional, name)
			continue
		}
		fields.Always = append(fields.Always, name)
	}

	sort.Strings(fields.Always)
	sort.Strings(fields.Optional)
	return fields
}

// Adding a field to a setup changes what the SPA may write, so the committed
// list has to move with it in the same commit.
func TestTheJobSetupFieldListIsCurrent(t *testing.T) {
	encoded, err := json.MarshalIndent(currentJobSetupFields(), "", "  ")
	if err != nil {
		t.Fatalf("encode the fields: %v", err)
	}
	encoded = append(encoded, '\n')

	if os.Getenv("EIP_UPDATE_JOB_SETUP_FIELDS") == "1" {
		if err := os.MkdirAll(filepath.Dir(setupFieldsPath), 0o755); err != nil {
			t.Fatalf("create the fixture directory: %v", err)
		}
		if err := os.WriteFile(setupFieldsPath, encoded, 0o644); err != nil {
			t.Fatalf("write the fields: %v", err)
		}
		t.Logf("wrote %s", setupFieldsPath)
		return
	}

	committed, err := os.ReadFile(setupFieldsPath)
	if err != nil {
		t.Fatalf("read %s: %v", setupFieldsPath, err)
	}
	if string(committed) != string(encoded) {
		t.Errorf("%s is out of date; regenerate with: %s", setupFieldsPath, regenerateSetupFields)
	}
}
