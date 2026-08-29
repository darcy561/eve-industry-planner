package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCheckOrigin(t *testing.T) {
	t.Setenv("EIP_ALLOWED_ORIGINS", "https://eveindustryplanner.com,http://localhost")

	cases := []struct {
		name   string
		origin string
		want   bool
	}{
		{"public site", "https://eveindustryplanner.com", true},
		{"localhost", "http://localhost", true},
		{"no origin header", "", true},
		{"foreign origin", "https://evil.example", false},
		{"scheme mismatch", "http://eveindustryplanner.com", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/ws", nil)
			if tc.origin != "" {
				r.Header.Set("Origin", tc.origin)
			}
			if got := checkOrigin(r); got != tc.want {
				t.Errorf("checkOrigin(%q) = %v, want %v", tc.origin, got, tc.want)
			}
		})
	}
}

// Host is the backend address behind the proxy chain, so a valid browser origin
// must still pass — the case gorilla's same-origin default gets wrong.
func TestCheckOriginIgnoresProxyRewrittenHost(t *testing.T) {
	t.Setenv("EIP_ALLOWED_ORIGINS", "https://eveindustryplanner.com")
	r := httptest.NewRequest(http.MethodGet, "/ws", nil)
	r.Host = "10.0.5.44:4001"
	r.Header.Set("Origin", "https://eveindustryplanner.com")
	if !checkOrigin(r) {
		t.Fatal("origin rejected despite proxy-rewritten Host")
	}
}

// With no allowlist configured the service fails closed for browsers, but a
// non-browser client sending no Origin header still connects.
func TestCheckOriginUnsetRefusesBrowsersOnly(t *testing.T) {
	t.Setenv("EIP_ALLOWED_ORIGINS", "")

	withOrigin := httptest.NewRequest(http.MethodGet, "/ws", nil)
	withOrigin.Header.Set("Origin", "https://eveindustryplanner.com")
	if checkOrigin(withOrigin) {
		t.Error("browser origin allowed while allowlist unset")
	}

	noOrigin := httptest.NewRequest(http.MethodGet, "/ws", nil)
	if !checkOrigin(noOrigin) {
		t.Error("request without Origin header should still be allowed")
	}
}

func TestCheckOriginWildcard(t *testing.T) {
	t.Setenv("EIP_ALLOWED_ORIGINS", "*")
	r := httptest.NewRequest(http.MethodGet, "/ws", nil)
	r.Header.Set("Origin", "https://anything.example")
	if !checkOrigin(r) {
		t.Fatal("wildcard should allow any origin")
	}
}
