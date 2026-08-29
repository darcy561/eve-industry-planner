package config

import (
	"slices"
	"testing"
)

func TestAllowedOriginsUnsetRefusesEveryOrigin(t *testing.T) {
	t.Setenv("EIP_ALLOWED_ORIGINS", "")
	if got := AllowedOrigins(); len(got) != 0 {
		t.Fatalf("unset must yield no allowed origins; got %v", got)
	}
}

func TestAllowedOriginsTrimsAndLowercases(t *testing.T) {
	t.Setenv("EIP_ALLOWED_ORIGINS", " HTTPS://Example.COM/ , http://localhost:5173 ,, ")
	got := AllowedOrigins()
	want := []string{"https://example.com", "http://localhost:5173"}
	if !slices.Equal(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}
