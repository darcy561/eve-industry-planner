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

// DefaultOTLPEndpoint is the gRPC host:port for the OTel collector on the default Docker Compose network.
const DefaultOTLPEndpoint = "otel-collector:4317"

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
	// Zero means [DefaultMetricExportInterval] (aligned with Prometheus scrape of otel-collector:8889).
	MetricExportInterval time.Duration

	SentryDSN              string
	SentryEnvironment      string
	SentryRelease          string
	SentryTracesSampleRate float64
}

// DefaultConfig returns OTLP settings for services running on the standard stack (collector as otel-collector:4317).
func DefaultConfig(serviceName string) Config {
	envTag := strings.TrimSpace(BakedAppMode)
	if envTag == "" {
		envTag = "production"
	}
	return Config{
		ServiceName:            strings.TrimSpace(serviceName),
		ServiceVersion:         "",
		OTLPEndpoint:           DefaultOTLPEndpoint,
		OTLPInsecure:           true,
		SentryDSN:              strings.TrimSpace(BakedSentryDSN),
		SentryEnvironment:      envTag,
		SentryRelease:          strings.TrimSpace(BakedRelease),
		SentryTracesSampleRate: resolveSentryTracesSampleRate(),
	}
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

func (c Config) shouldInit() bool {
	if c.ServiceName == "" {
		return false
	}
	return c.OTLPEndpoint != "" || c.SentryDSN != ""
}
