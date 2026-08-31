package kit

import (
	"os"
	"testing"
)

func TestAssetName(t *testing.T) {
	if got := AssetName("windows", "amd64"); got != "eip-windows-amd64.exe" {
		t.Fatalf("got %q", got)
	}
	if got := AssetName("linux", "amd64"); got != "eip-linux-amd64" {
		t.Fatalf("got %q", got)
	}
	if got := AssetName("darwin", "arm64"); got != "eip-darwin-arm64" {
		t.Fatalf("got %q", got)
	}
}

func TestNormalizeVersion(t *testing.T) {
	if got := normalizeVersion("v1.2.3"); got != "1.2.3" {
		t.Fatalf("got %q", got)
	}
	if got := normalizeVersion("1.2.3"); got != "1.2.3" {
		t.Fatalf("got %q", got)
	}
	if got := normalizeVersion("cli-v1.0.0"); got != "1.0.0" {
		t.Fatalf("cli-v got %q", got)
	}
	if got := normalizeVersion("cli"); got != "" {
		t.Fatalf("floating cli got %q", got)
	}
}

func TestIsFloatingReleaseTag(t *testing.T) {
	t.Parallel()
	for _, tag := range []string{"cli", "prerelease", "prerelease-swarm-hard-cutover"} {
		if !isFloatingReleaseTag(tag) {
			t.Fatalf("%q should be floating", tag)
		}
	}
	for _, tag := range []string{"cli-v1.0.0", "1.2.3", "v1.2.3"} {
		if isFloatingReleaseTag(tag) {
			t.Fatalf("%q should not be floating", tag)
		}
	}
}

func TestIsLocalDevVersion(t *testing.T) {
	t.Parallel()
	if !isLocalDevVersion("0.0.0-prerelease.swarm-hard-cutover.local") {
		t.Fatal("expected .local soak version")
	}
	if isLocalDevVersion("0.0.0-prerelease.swarm-hard-cutover.cd03e98") {
		t.Fatal("published pin is not local")
	}
}

func TestChannelTagFromAppVersion(t *testing.T) {
	cases := map[string]string{
		"prerelease":                    "prerelease",
		"prerelease-swarm-hard-cutover": "prerelease-swarm-hard-cutover",
		"1.2.3":                         "",
		"latest":                        "",
		"0.0.0-prerelease.swarm-hard-cutover.abc1234": "",
		"": "",
	}
	for in, want := range cases {
		if got := channelTagFromAppVersion(in); got != want {
			t.Fatalf("APP_VERSION=%q got %q want %q", in, got, want)
		}
	}
}

func TestDefaultAppVersionUsesChannel(t *testing.T) {
	prev := Channel
	t.Cleanup(func() { Channel = prev })
	Channel = "prerelease-swarm-hard-cutover"
	if got := DefaultAppVersion(); got != Channel {
		t.Fatalf("DefaultAppVersion=%q", got)
	}
	if got := BakedUpdateChannel(); got != Channel {
		t.Fatalf("BakedUpdateChannel=%q", got)
	}
	// Public / local: Channel empty, "cli", or semver → no APP_VERSION preset
	Channel = "cli"
	if got := DefaultAppVersion(); got != "" {
		t.Fatalf("cli must not preset APP_VERSION, got %q", got)
	}
	if got := BinaryChannel(); got != "cli" {
		t.Fatalf("BinaryChannel=%q", got)
	}
	Channel = "1.2.3"
	if got := DefaultAppVersion(); got != "" {
		t.Fatalf("semver must not preset APP_VERSION, got %q", got)
	}
	Channel = ""
	if got := DefaultAppVersion(); got != "" {
		t.Fatalf("empty Channel must not preset APP_VERSION, got %q", got)
	}
	if got := BinaryChannel(); got != "cli" {
		t.Fatalf("default BinaryChannel=%q", got)
	}
}

func TestResolveKitBranch(t *testing.T) {
	prevB, prevEnv := KitBranch, os.Getenv("EIP_KIT_BRANCH")
	t.Cleanup(func() {
		KitBranch = prevB
		if prevEnv == "" {
			_ = os.Unsetenv("EIP_KIT_BRANCH")
		} else {
			_ = os.Setenv("EIP_KIT_BRANCH", prevEnv)
		}
	})
	_ = os.Unsetenv("EIP_KIT_BRANCH")
	KitBranch = ""
	if got := ResolveKitBranch(); got != "Public" {
		t.Fatalf("default=%q", got)
	}
	KitBranch = "swarm/hard-cutover"
	if got := ResolveKitBranch(); got != "swarm/hard-cutover" {
		t.Fatalf("baked=%q", got)
	}
	t.Setenv("EIP_KIT_BRANCH", "Development")
	if got := ResolveKitBranch(); got != "Development" {
		t.Fatalf("env=%q", got)
	}
}

func TestParseSHA256SUMS(t *testing.T) {
	text := `
# comment
aabbccdd  eip-linux-amd64
eeff0011 *eip-windows-amd64.exe
`
	m := parseSHA256SUMS(text)
	if m["eip-linux-amd64"] != "aabbccdd" {
		t.Fatalf("linux: %#v", m)
	}
	if m["eip-windows-amd64.exe"] != "eeff0011" {
		t.Fatalf("windows: %#v", m)
	}
}
