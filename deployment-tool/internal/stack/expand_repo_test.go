package stack

import (
	"context"
	"maps"
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
	devTags := map[string]string{
		"TAG_api": "t", "TAG_core": "t", "TAG_frontend": "t",
		"TAG_websocket": "t", "TAG_worker": "t", "TAG_ws_router": "t",
	}
	// EIP_ALLOWED_ORIGINS is declared `${VAR:?}`: an operator must set it, and
	// interpolation fails without it. Supplied here so the expansion under test
	// is the one an operator gets, rather than the stack being weakened to a
	// default no deployment should run with.
	const allowedOrigins = "https://example.test"
	cases := []struct {
		name  string
		src   string
		files []string
		env   map[string]string
	}{
		{"data live", "live", []string{"docker-stack.data.yml"}, nil},
		{"app live", "live", []string{"docker-stack.yml"}, map[string]string{"EIP_ALLOWED_ORIGINS": allowedOrigins}},
		{"app+dev", "dev", []string{"docker-stack.yml", "docker-stack.dev.yml"}, withOrigins(devTags, allowedOrigins)},
		{"data+dev", "dev", []string{"docker-stack.data.yml", "docker-stack.data.dev.yml"}, nil},
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

// The data dev overlay publishes mongo and redis on the host for local tooling;
// the live data fragment alone must keep the data layer mesh-internal.
func TestExpandDataDevPublishesDataPorts(t *testing.T) {
	root := repoRoot(t)
	ctx := context.Background()
	for _, f := range []string{"docker-stack.data.yml", "docker-stack.data.dev.yml"} {
		if _, err := os.Stat(filepath.Join(root, f)); err != nil {
			t.Skipf("missing %s", f)
		}
	}

	expand := func(t *testing.T, files []string, src string) string {
		t.Helper()
		path, err := Expand(ctx, Opts{Home: root, StackFiles: files, Source: src})
		if err != nil {
			t.Fatal(err)
		}
		defer os.Remove(path)
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		return string(raw)
	}

	live := expand(t, []string{"docker-stack.data.yml"}, "live")
	if strings.Contains(live, "published:") {
		t.Errorf("live data fragment must not publish data ports on the host:\n%s", live)
	}

	dev := expand(t, []string{"docker-stack.data.yml", "docker-stack.data.dev.yml"}, "dev")
	for _, port := range []string{"published: 27017", "published: 6379"} {
		if !strings.Contains(dev, port) {
			t.Errorf("data dev overlay missing %q:\n%s", port, dev)
		}
	}
	// Host mode binds only the node running the task; ingress would span the mesh.
	if strings.Count(dev, "mode: host") != 2 {
		t.Errorf("want both data ports published in host mode, got:\n%s", dev)
	}
}

// withOrigins copies env and adds the allowlist, so a case keeping its own
// variables does not have to restate them.
func withOrigins(env map[string]string, origins string) map[string]string {
	out := make(map[string]string, len(env)+1)
	maps.Copy(out, env)
	out["EIP_ALLOWED_ORIGINS"] = origins
	return out
}
