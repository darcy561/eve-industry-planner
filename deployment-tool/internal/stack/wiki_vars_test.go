package stack

import (
	"testing"

	"github.com/compose-spec/compose-go/v2/types"
)

func TestWikiCompatTag(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in, want string
	}{
		{"1.2.3", "1.2"},
		{"0.8.0", "0.8"},
		{"v2.1.0", "2.1"},
		{"0.0.0-prerelease.development.abc1234", "0.0.0-prerelease.development.abc1234"},
		{"prerelease", "prerelease"},
		{"prerelease-swarm-my-feature", "prerelease-swarm-my-feature"},
		{"latest", "latest"},
		{"1.2", "1.2"},
		{"1", "1"},
		{"", ""},
		{" 1.4.0 ", "1.4"},
	}
	for _, tc := range cases {
		if got := WikiCompatTag(tc.in); got != tc.want {
			t.Errorf("WikiCompatTag(%q)=%q want %q", tc.in, got, tc.want)
		}
	}
}

func TestWikiHost(t *testing.T) {
	t.Parallel()
	got, err := WikiHost("dev", "")
	if err != nil || got != "localhost" {
		t.Fatalf("dev: got %q %v", got, err)
	}
	got, err = WikiHost("dev", "https://ignored.example/callback")
	if err != nil || got != "localhost" {
		t.Fatalf("dev ignores callback: got %q %v", got, err)
	}
	got, err = WikiHost("live", "https://eve.example.com/auth/callback")
	if err != nil || got != "eve.example.com" {
		t.Fatalf("live: got %q %v", got, err)
	}
	got, err = WikiHost("live", "https://localhost:3000/callback")
	if err != nil || got != "localhost" {
		t.Fatalf("live localhost: got %q %v", got, err)
	}
	if _, err := WikiHost("live", ""); err == nil {
		t.Fatal("live empty callback should fail")
	}
	if _, err := WikiHost("live", "not a url"); err == nil {
		t.Fatal("live unparseable callback should fail")
	}
	if _, err := WikiHost("live", "/relative"); err == nil {
		t.Fatal("live relative callback should fail")
	}
}

func TestApplyWikiExpandEnv(t *testing.T) {
	t.Parallel()
	env := types.Mapping{"APP_VERSION": "3.1.4"}
	if err := applyWikiExpandEnv(env, "live", nil); err != nil {
		t.Fatal(err)
	}
	if env["WIKI_COMPAT_TAG"] != "3.1" {
		t.Fatalf("compat=%q", env["WIKI_COMPAT_TAG"])
	}
	if _, ok := env["EIP_WIKI_HOST"]; ok {
		t.Fatalf("host set without wiki YAML: %q", env["EIP_WIKI_HOST"])
	}

	withWiki := []composeSource{{YAML: []byte("Host(`wiki.${EIP_WIKI_HOST}`)")}}
	if err := applyWikiExpandEnv(env, "live", withWiki); err == nil {
		t.Fatal("live wiki without callback should fail")
	}
	env["EVE_CALLBACK_URL"] = "https://app.example.org/cb"
	if err := applyWikiExpandEnv(env, "live", withWiki); err != nil {
		t.Fatal(err)
	}
	if env["EIP_WIKI_HOST"] != "app.example.org" {
		t.Fatalf("host=%q", env["EIP_WIKI_HOST"])
	}
	if err := applyWikiExpandEnv(env, "dev", withWiki); err != nil {
		t.Fatal(err)
	}
	if env["EIP_WIKI_HOST"] != "localhost" {
		t.Fatalf("dev host=%q", env["EIP_WIKI_HOST"])
	}
}
