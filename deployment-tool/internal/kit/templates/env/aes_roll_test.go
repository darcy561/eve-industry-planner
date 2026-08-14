package env

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestNextAESKeyVersion(t *testing.T) {
	t.Parallel()
	cases := map[string]string{
		"":   "v2",
		"v1": "v2",
		"v2": "v3",
		"V9": "v10",
		"x":  "v2",
	}
	for in, want := range cases {
		if got := NextAESKeyVersion(in); got != want {
			t.Fatalf("NextAESKeyVersion(%q)=%q want %q", in, got, want)
		}
	}
}

func TestResolveEnvFieldsAESRollBumpsVersionAndLegacy(t *testing.T) {
	t.Parallel()
	oldKey, err := Generate(FieldAES)
	if err != nil {
		t.Fatal(err)
	}
	vals := DefaultEnvValues()
	vals[refreshTokenAESKey] = oldKey
	vals[refreshTokenAESKeyVersion] = "v1"
	vals[refreshTokenAESLegacyKeys] = "{}"

	out, err := ResolveEnvFields(vals, map[string]bool{refreshTokenAESKey: true})
	if err != nil {
		t.Fatal(err)
	}
	if out[refreshTokenAESKey] == "" || out[refreshTokenAESKey] == oldKey {
		t.Fatalf("AES key not rolled: %q", out[refreshTokenAESKey])
	}
	if out[refreshTokenAESKeyVersion] != "v2" {
		t.Fatalf("version=%q want v2", out[refreshTokenAESKeyVersion])
	}
	var legacy map[string]string
	if err := json.Unmarshal([]byte(out[refreshTokenAESLegacyKeys]), &legacy); err != nil {
		t.Fatalf("legacy JSON: %v (%q)", err, out[refreshTokenAESLegacyKeys])
	}
	if legacy["v1"] != oldKey {
		t.Fatalf("legacy v1=%q want old key", legacy["v1"])
	}
	if _, ok := legacy["v2"]; ok {
		t.Fatal("active v2 must not appear in legacy")
	}
}

func TestResolveEnvFieldsAESFirstCreateKeepsV1(t *testing.T) {
	t.Parallel()
	vals := DefaultEnvValues()
	vals[refreshTokenAESKey] = ""
	vals[refreshTokenAESKeyVersion] = ""
	vals[refreshTokenAESLegacyKeys] = "{}"

	out, err := ResolveEnvFields(vals, map[string]bool{refreshTokenAESKey: true})
	if err != nil {
		t.Fatal(err)
	}
	if !IsSetSecret(out[refreshTokenAESKey]) {
		t.Fatal("expected generated AES key")
	}
	if out[refreshTokenAESKeyVersion] != "v1" {
		t.Fatalf("first create version=%q want v1", out[refreshTokenAESKeyVersion])
	}
	if strings.TrimSpace(out[refreshTokenAESLegacyKeys]) != "{}" {
		t.Fatalf("legacy=%q want {}", out[refreshTokenAESLegacyKeys])
	}
}
