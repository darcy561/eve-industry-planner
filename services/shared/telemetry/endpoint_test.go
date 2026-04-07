package telemetry

import "testing"

func TestNormalizeOTLPEndpoint(t *testing.T) {
	tests := []struct {
		in      string
		want    string
		wantErr bool
	}{
		{"otel-collector:4317", "otel-collector:4317", false},
		{"http://otel-collector:4317", "otel-collector:4317", false},
		{"https://127.0.0.1:4317", "127.0.0.1:4317", false},
		{"", "", true},
	}
	for _, tt := range tests {
		got, err := normalizeOTLPEndpoint(tt.in)
		if tt.wantErr {
			if err == nil {
				t.Fatalf("normalizeOTLPEndpoint(%q) err nil, want error", tt.in)
			}
			continue
		}
		if err != nil {
			t.Fatalf("normalizeOTLPEndpoint(%q): %v", tt.in, err)
		}
		if got != tt.want {
			t.Fatalf("normalizeOTLPEndpoint(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestConfig_shouldInit(t *testing.T) {
	c := DefaultConfig("api")
	if !c.shouldInit() {
		t.Fatal("expected init with default OTLP")
	}
	c = Config{ServiceName: "api", SentryDSN: "https://example@o.ingest.sentry.io/1"}
	if !c.shouldInit() {
		t.Fatal("expected init with Sentry")
	}
	c = Config{ServiceName: "api", OTLPEndpoint: "", SentryDSN: ""}
	if c.shouldInit() {
		t.Fatal("expected no init without OTLP or Sentry")
	}
}
