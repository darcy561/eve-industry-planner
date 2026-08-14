package ref

import "testing"

func TestParseRefVersion(t *testing.T) {
	tests := []struct {
		name        string
		ref         string
		wantVersion string
		wantKind    string
		wantOK      bool
	}{
		{name: "character", ref: "v1_char_abc123", wantVersion: "v1", wantKind: "char", wantOK: true},
		{name: "corporation", ref: "v1_corp_abc123", wantVersion: "v1", wantKind: "corp", wantOK: true},
		{name: "alliance", ref: "v2_alliance_abc123", wantVersion: "v2", wantKind: "alliance", wantOK: true},
		{name: "surrounding space", ref: "  v1_char_abc123  ", wantVersion: "v1", wantKind: "char", wantOK: true},
		{name: "token keeps underscores", ref: "v1_char_ab_c1", wantVersion: "v1", wantKind: "char", wantOK: true},
		{name: "unknown kind", ref: "v1_ship_abc123"},
		{name: "version without v", ref: "1_char_abc123"},
		{name: "empty token", ref: "v1_char_"},
		{name: "too few parts", ref: "v1_char"},
		{name: "empty", ref: ""},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			version, kind, ok := ParseRefVersion(tc.ref)
			if ok != tc.wantOK {
				t.Fatalf("ok = %v, want %v", ok, tc.wantOK)
			}
			if version != tc.wantVersion || kind != tc.wantKind {
				t.Fatalf("got (%q, %q), want (%q, %q)", version, kind, tc.wantVersion, tc.wantKind)
			}
		})
	}
}

func TestValidateRefShape(t *testing.T) {
	tests := []struct {
		name string
		ref  string
		want bool
	}{
		{name: "base64url token", ref: "v1_char_abcABC012-_", want: true},
		{name: "malformed ref", ref: "v1_char", want: false},
		{name: "unknown kind", ref: "v1_ship_abc", want: false},
		{name: "padding character", ref: "v1_char_abc=", want: false},
		{name: "non base64url character", ref: "v1_char_abc!", want: false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := ValidateRefShape(tc.ref); got != tc.want {
				t.Fatalf("ValidateRefShape(%q) = %v, want %v", tc.ref, got, tc.want)
			}
		})
	}
}
