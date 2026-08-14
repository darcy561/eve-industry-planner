package asynq

import "testing"

func TestResolveConcurrencyDefaultAndCap(t *testing.T) {
	t.Parallel()
	if got := ResolveConcurrency(0); got != DefaultConcurrency {
		t.Fatalf("0 -> %d want %d", got, DefaultConcurrency)
	}
	if got := ResolveConcurrency(25); got != 25 {
		t.Fatalf("25 -> %d", got)
	}
	if got := ResolveConcurrency(100); got != MaxConcurrency {
		t.Fatalf("100 -> %d want cap %d", got, MaxConcurrency)
	}
	if MaxConcurrency != 50 || DefaultConcurrency != 50 {
		t.Fatalf("expected default/cap 50, got default=%d max=%d", DefaultConcurrency, MaxConcurrency)
	}
}
