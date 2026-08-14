package firestoreimport

import (
	"encoding/json"
	"fmt"
	"os"
)

func projectIDFromServiceAccountJSON(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	var meta struct {
		ProjectID string `json:"project_id"`
	}
	if err := json.Unmarshal(b, &meta); err != nil {
		return "", fmt.Errorf("parse service account %s: %w", path, err)
	}
	if meta.ProjectID == "" {
		return "", fmt.Errorf("service account %s: missing project_id", path)
	}
	return meta.ProjectID, nil
}
