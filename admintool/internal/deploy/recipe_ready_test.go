package deploy

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// Guard: dataplane.Ready (mongo Ensure / index builds) must not sit under a short
// context.WithTimeout envelope — slow first index builds must wait until done.
func TestRecipeReadyUsesParentContext(t *testing.T) {
	t.Parallel()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller")
	}
	src, err := os.ReadFile(filepath.Join(filepath.Dir(file), "recipe.go"))
	if err != nil {
		t.Fatal(err)
	}
	body := string(src)
	idx := strings.Index(body, "dataplane.Ready(")
	if idx < 0 {
		t.Fatal("dataplane.Ready call missing")
	}
	// Look at a window before the call for a local ready timeout helper.
	window := body
	if idx > 400 {
		window = body[idx-400 : idx]
	} else {
		window = body[:idx]
	}
	if strings.Contains(window, "WithTimeout") && strings.Contains(window, "ready") {
		t.Fatalf("dataplane.Ready appears wrapped by a ready timeout nearby:\n%s", window)
	}
	// Exact call site should use parent ctx, not a derived readyCtx.
	snippet := body[idx:]
	if end := strings.Index(snippet, "\n"); end > 0 {
		snippet = snippet[:end]
	}
	if !strings.Contains(snippet, "dataplane.Ready(ctx,") {
		t.Fatalf("want dataplane.Ready(ctx,…), got %q", snippet)
	}
}
