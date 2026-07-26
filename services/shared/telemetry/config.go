package telemetry

import (
	"os"
	"strconv"
	"strings"
	"time"
)

// sentryTracesSampleRateEnv is optional: when set (non-empty), it overrides the link-time
// baked rate for Sentry performance traces. Omitted or empty → use baked; both empty → 0.
const sentryTracesSampleRateEnv = "SENTRY_TRACES_SAMPLE_RATE"

// DefaultOTLPEndpoint is the gRPC host:port for Alloy (DNS alias on eip-core when obs addon is up).
const DefaultOTLPEndpoint = "alloy:4317"

// DefaultMetricExportInterval is the OTLP metric reader period when [Config.MetricExportInterval] is zero.
// Match Prometheus global scrape_interval for job otel_collector (see observability/prometheus/prometheus.yml)
// so the collector’s :8889 exposition updates between scrapes instead of going stale for a full minute.
const DefaultMetricExportInterval = 15 * time.Second

// Config controls Init. Sentry DSN/release come from link-time [Baked*] vars (see baked.go).
// SentryTracesSampleRate is resolved by [resolveSentryTracesSampleRate]: runtime
// SENTRY_TRACES_SAMPLE_RATE overrides baked BakedSentryTracesSampleRate when set.
type Config struct {
	ServiceName    string
	ServiceVersion string

	OTLPEndpoint string
	OTLPInsecure bool

	// MetricExportInterval is how often the SDK pushes OTLP metrics to the collector.
	// Zero means [DefaultMetricExportInterval] (aligned with Prometheus ingest from Alloy remote write).
	MetricExportInterval time.Duration

	SentryDSN              string
	SentryEnvironment      string
	SentryRelease          string
	SentryTracesSampleRate float64
}

// DefaultConfig returns OTLP settings for services running on the standard stack (Alloy as alloy:4317).
func DefaultConfig(serviceName string) Config {
	return Config{
		ServiceName:            strings.TrimSpace(serviceName),
		ServiceVersion:         resolveServiceVersion(),
		OTLPEndpoint:           DefaultOTLPEndpoint,
		OTLPInsecure:           true,
		SentryDSN:              strings.TrimSpace(BakedSentryDSN),
		SentryEnvironment:      resolveDeploymentEnvironment(),
		SentryRelease:          strings.TrimSpace(BakedRelease),
		SentryTracesSampleRate: resolveSentryTracesSampleRate(),
	}
}

// resolveDeploymentEnvironment prefers runtime .env (Swarm env_file) over bake-time mode.
// Order: DEPLOYMENT_ENVIRONMENT → ENVIRONMENT → BakedAppMode → "production".
func resolveDeploymentEnvironment() string {
	for _, key := range []string{"DEPLOYMENT_ENVIRONMENT", "ENVIRONMENT"} {
		if v := strings.TrimSpace(os.Getenv(key)); v != "" {
			return v
		}
	}
	if v := strings.TrimSpace(BakedAppMode); v != "" {
		return v
	}
	return "production"
}

// parseTraceSampleRate parses a performance-trace sample rate in [0,1].
// Empty or invalid input yields 0 (no performance traces; Sentry errors still use SampleRate 1.0 in telemetry.Init).
func parseTraceSampleRate(raw string) float64 {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0
	}
	f, err := strconv.ParseFloat(raw, 64)
	if err != nil || f < 0 || f > 1 {
		return 0
	}
	return f
}

func resolveSentryTracesSampleRate() float64 {
	if v := strings.TrimSpace(os.Getenv(sentryTracesSampleRateEnv)); v != "" {
		return parseTraceSampleRate(v)
	}
	return parseTraceSampleRate(BakedSentryTracesSampleRate)
}

// resolveServiceVersion returns the app semver for OTLP service.version (logs/metrics resource).
// Priority: link-time BakedRelease (Docker APP_VERSION) → APP_VERSION_NUMBER → APP_VERSION → FRONTEND_APP_VERSION.
func resolveServiceVersion() string {
	if v := strings.TrimSpace(BakedRelease); v != "" {
		return v
	}
	for _, key := range []string{"APP_VERSION_NUMBER", "APP_VERSION", "FRONTEND_APP_VERSION"} {
		if v := strings.TrimSpace(os.Getenv(key)); v != "" {
			return v
		}
	}
	return ""
}

func (c Config) shouldInit() bool {
	if c.ServiceName == "" {
		return false
	}
	return c.OTLPEndpoint != "" || c.SentryDSN != ""
}
