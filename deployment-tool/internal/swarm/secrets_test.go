package swarm

import (
	"path/filepath"
	"testing"
)

func TestDiscoverAttachFromAppStack(t *testing.T) {
	t.Parallel()
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	path := filepath.Join(root, "docker-stack.yml")
	got, err := DiscoverAttach(path)
	if err != nil {
		t.Fatal(err)
	}
	wantSvc := map[string]bool{
		"api": true, "websocket": true, "worker": true, "core": true, "ws-router": true,
	}
	seen := map[string]bool{}
	for _, a := range got {
		seen[a.Service] = true
		if a.Service == "api" && a.Key == "MONGO_PASSWORD" {
			return
		}
	}
	for svc := range wantSvc {
		if !seen[svc] {
			t.Fatalf("missing service %s in attach discovery", svc)
		}
	}
	t.Fatal("api/MONGO_PASSWORD not found")
}
