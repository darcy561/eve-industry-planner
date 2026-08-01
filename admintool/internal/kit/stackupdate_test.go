package kit_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"eve-industry-planner/admintool/internal/kit"
)

func TestUpdateStacksMissingOnly(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	existing := filepath.Join(home, kit.AppStackFile)
	if err := os.WriteFile(existing, []byte("keep-me\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(r.URL.Path, "/")
		_, _ = w.Write([]byte("remote-" + name + "\n"))
	}))
	t.Cleanup(srv.Close)

	// Point raw.githubusercontent base at the test server by overriding Repo + monkey… 
	// UpdateStacks builds https://raw.githubusercontent.com/<repo>/refs/heads/<branch>/<file>.
	// Use a custom HTTP client that rewrites the host to the test server.
	client := &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			u := *req.URL
			u.Scheme = "http"
			u.Host = strings.TrimPrefix(srv.URL, "http://")
			// path ends with /docker-stack.yml — keep basename only for the stub server
			base := filepath.Base(u.Path)
			u.Path = "/" + base
			req2 := req.Clone(req.Context())
			req2.URL = &u
			req2.Host = u.Host
			return http.DefaultTransport.RoundTrip(req2)
		}),
	}

	res, err := kit.UpdateStacks(context.Background(), kit.StackUpdateOptions{
		Home:        home,
		Branch:      "Public",
		Repo:        "owner/name",
		MissingOnly: true,
		HTTPClient:  client,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Unchanged) != 1 || res.Unchanged[0] != kit.AppStackFile {
		t.Fatalf("unchanged=%v", res.Unchanged)
	}
	if len(res.Updated) != 2 {
		t.Fatalf("updated=%v want data+obs", res.Updated)
	}
	got, err := os.ReadFile(existing)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "keep-me\n" {
		t.Fatalf("existing stack overwritten: %q", got)
	}
	data, err := os.ReadFile(filepath.Join(home, kit.DataStackFile))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), kit.DataStackFile) {
		t.Fatalf("data stack body=%q", data)
	}
}

func TestStacksMissing(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	if !kit.StacksMissing(home) {
		t.Fatal("empty home")
	}
	for _, name := range kit.StackFiles {
		if err := os.WriteFile(filepath.Join(home, name), []byte("x\n"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if kit.StacksMissing(home) {
		t.Fatal("all present")
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}
