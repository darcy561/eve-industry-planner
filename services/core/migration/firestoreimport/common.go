package firestoreimport

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"
)

// runImmediateCleanups is duplicated from core/commands to keep migration code deletable in one place.
func runImmediateCleanups(cleanups ...func(context.Context)) {
	for _, fn := range cleanups {
		if fn == nil {
			continue
		}
		cctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		func() {
			defer cancel()
			fn(cctx)
		}()
	}
}

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
