package firestoreimport

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestProjectIDFromServiceAccountJSON(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "sa.json")
	payload := map[string]string{
		"type":         "service_account",
		"project_id":   "my-gcp-project",
		"private_key":  "-----BEGIN PRIVATE KEY-----\nnoop\n-----END PRIVATE KEY-----\n",
		"client_email": "svc@my-gcp-project.iam.gserviceaccount.com",
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		t.Fatal(err)
	}

	got, err := projectIDFromServiceAccountJSON(path)
	if err != nil {
		t.Fatalf("projectIDFromServiceAccountJSON: %v", err)
	}
	if got != "my-gcp-project" {
		t.Fatalf("got %q want %q", got, "my-gcp-project")
	}
}

func TestProjectIDFromServiceAccountJSON_missingProjectID(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "sa.json")
	payload := map[string]string{
		"type":         "service_account",
		"private_key":  "-----BEGIN PRIVATE KEY-----\nnoop\n-----END PRIVATE KEY-----\n",
		"client_email": "svc@x.iam.gserviceaccount.com",
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		t.Fatal(err)
	}

	_, err = projectIDFromServiceAccountJSON(path)
	if err == nil {
		t.Fatal("expected error for missing project_id")
	}
}
