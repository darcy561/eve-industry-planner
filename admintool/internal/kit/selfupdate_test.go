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
