package telemetry

import (
	"testing"
)

func TestParseTraceSampleRate(t *testing.T) {
	tests := []struct {
		in   string
		want float64
	}{
		{"", 0},
		{"0", 0},
		{"0.0", 0},
		{"0.25", 0.25},
		{"1", 1},
		{"1.0", 1},
		{" 0.5 ", 0.5},
		{"2", 0},
		{"-1", 0},
		{"nope", 0},
	}
	for _, tt := range tests {
		if got := parseTraceSampleRate(tt.in); got != tt.want {
			t.Errorf("parseTraceSampleRate(%q) = %v, want %v", tt.in, got, tt.want)
		}
	}
}

func TestResolveSentryTracesSampleRate_envOverridesBaked(t *testing.T) {
	t.Setenv(sentryTracesSampleRateEnv, "0.2")
	saved := BakedSentryTracesSampleRate
	BakedSentryTracesSampleRate = "0.9"
	t.Cleanup(func() { BakedSentryTracesSampleRate = saved })

	if got := resolveSentryTracesSampleRate(); got != 0.2 {
		t.Fatalf("want env to win: got %v", got)
	}
}

func TestResolveSentryTracesSampleRate_fallsBackToBaked(t *testing.T) {
	t.Setenv(sentryTracesSampleRateEnv, "")
	saved := BakedSentryTracesSampleRate
	BakedSentryTracesSampleRate = "0.15"
	t.Cleanup(func() { BakedSentryTracesSampleRate = saved })

	if got := resolveSentryTracesSampleRate(); got != 0.15 {
		t.Fatalf("want baked: got %v", got)
	}
}

func TestResolveServiceVersion_bakedRelease(t *testing.T) {
	saved := BakedRelease
	BakedRelease = "1.2.3"
	t.Cleanup(func() { BakedRelease = saved })

	if got := resolveServiceVersion(); got != "1.2.3" {
		t.Fatalf("got %q", got)
	}
}

func TestResolveServiceVersion_envFallback(t *testing.T) {
	saved := BakedRelease
	BakedRelease = ""
	t.Cleanup(func() { BakedRelease = saved })
	t.Setenv("APP_VERSION_NUMBER", "0.8.15")

	if got := resolveServiceVersion(); got != "0.8.15" {
		t.Fatalf("got %q", got)
	}
}

func TestDefaultConfig_serviceVersion(t *testing.T) {
	saved := BakedRelease
	BakedRelease = "2.0.0"
	t.Cleanup(func() { BakedRelease = saved })

	if got := DefaultConfig("api").ServiceVersion; got != "2.0.0" {
		t.Fatalf("got %q", got)
	}
}

func TestResolveSentryTracesSampleRate_emptyMeansZero(t *testing.T) {
	t.Setenv(sentryTracesSampleRateEnv, "")
	saved := BakedSentryTracesSampleRate
	BakedSentryTracesSampleRate = ""
	t.Cleanup(func() { BakedSentryTracesSampleRate = saved })

	if got := resolveSentryTracesSampleRate(); got != 0 {
		t.Fatalf("want 0: got %v", got)
	}
}
