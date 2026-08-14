package stack

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// repoRoot is the Eve-Industry-Planner-React checkout (deployment-tool/../).
func repoRoot(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller")
	}
	root := filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", ".."))
	if _, err := os.Stat(filepath.Join(root, "docker-stack.yml")); err != nil {
		t.Skipf("repo docker-stack.yml not found under %s: %v", root, err)
	}
	return root
}

func TestExpandRepoStacksNoBareDollarCORS(t *testing.T) {
	root := repoRoot(t)
	ctx := context.Background()
	liveEnv := map[string]string{
		"APP_VERSION":      "1.2.3",
		"EVE_CALLBACK_URL": "https://example.test/callback",
	}
	devTags := map[string]string{
		"TAG_api": "t", "TAG_core": "t", "TAG_frontend": "t",
		"TAG_websocket": "t", "TAG_worker": "t", "TAG_ws_router": "t",
		"TAG_capacity_controller": "t", "TAG_wiki": "t",
		"APP_VERSION": "1.2.3", "EVE_CALLBACK_URL": "https://example.test/callback",
	}
	cases := []struct {
		name  string
		src   string
		files []string
		env   map[string]string
	}{
		{"data live", "live", []string{"docker-stack.data.yml"}, nil},
		{"app live", "live", []string{"docker-stack.yml"}, liveEnv},
		{"app+dev", "dev", []string{"docker-stack.yml", "docker-stack.dev.yml"}, devTags},
		{"obs live", "live", []string{"docker-stack.obs.yml"}, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			for _, f := range tc.files {
				if _, err := os.Stat(filepath.Join(root, f)); err != nil {
					t.Skipf("missing %s", f)
				}
			}
			path, err := Expand(ctx, Opts{
				Home:       root,
				StackFiles: tc.files,
				Source:     tc.src,
				Env:        tc.env,
			})
			if err != nil {
				t.Fatal(err)
			}
			defer os.Remove(path)
			raw, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			text := string(raw)
			assertStackDeploySafeDollars(t, text)
			if tc.name == "app live" {
				if strings.Contains(text, "${WIKI_COMPAT_TAG}") || strings.Contains(text, "${EIP_WIKI_HOST}") {
					t.Fatal("wiki expand vars left unsubstituted")
				}
				if !strings.Contains(text, "wiki.example.test") {
					t.Fatal("missing wiki Host")
				}
				if !strings.Contains(text, "eve-industry-planner-wiki:1.2") {
					t.Fatal("missing wiki compat tag")
				}
			}
			if tc.name == "app+dev" {
				if !strings.Contains(text, "wiki.localhost") {
					t.Fatal("missing wiki.localhost")
				}
				if !strings.Contains(text, "eve-industry-planner-wiki:t") {
					t.Fatal("missing dev wiki image")
				}
			}
		})
	}
}

func assertStackDeploySafeDollars(t *testing.T, text string) {
	t.Helper()
	// CORS regex anchors must be $$ for docker stack deploy's second interpolate.
	for line := range strings.SplitSeq(text, "\n") {
		if !strings.Contains(line, "accessControlAllowOriginListRegex") {
			continue
		}
		if strings.Contains(line, "$$") {
			continue
		}
		if strings.Contains(line, "$") {
			t.Fatalf("unescaped $ in CORS label (would fail stack deploy):\n%s", line)
		}
	}
	// Healthcheck shell vars must stay $$VAR after our re-escape.
	for _, needle := range []string{"REDIS_PASSWORD", "MONGO_ROOT_USERNAME", "MONGO_ROOT_PASSWORD"} {
		if !strings.Contains(text, needle) {
			continue
		}
		if strings.Contains(text, "$$"+needle) {
			continue
		}
		// Single $VAR would be wrong for stack deploy → container shell.
		if strings.Contains(text, "$"+needle) {
			t.Fatalf("healthcheck %s not $$ escaped for stack deploy", needle)
		}
	}
}
