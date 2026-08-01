package kit

import (
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
}

func TestChannelTagFromAppVersion(t *testing.T) {
	cases := map[string]string{
		"prerelease":                        "prerelease",
		"prerelease-swarm-hard-cutover":     "prerelease-swarm-hard-cutover",
		"1.2.3":                             "",
		"latest":                            "",
		"0.0.0-prerelease.swarm-hard-cutover.abc1234": "",
		"": "",
	}
	for in, want := range cases {
		if got := channelTagFromAppVersion(in); got != want {
			t.Fatalf("APP_VERSION=%q got %q want %q", in, got, want)
		}
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
