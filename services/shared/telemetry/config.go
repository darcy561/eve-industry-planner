package telemetry

import (
	"strconv"
	"strings"
	"time"
)

// DefaultOTLPEndpoint is the gRPC host:port for the OTel collector on the default Docker Compose network.
const DefaultOTLPEndpoint = "otel-collector:4317"

// DefaultMetricExportInterval is the OTLP metric reader period when [Config.MetricExportInterval] is zero.
// Match Prometheus global scrape_interval for job otel_collector (see observability/prometheus/prometheus.yml)
// so the collector’s :8889 exposition updates between scrapes instead of going stale for a full minute.
const DefaultMetricExportInterval = 15 * time.Second

// Config controls Init. Sentry fields come from link-time [Baked*] vars (see baked.go), not .env.
// OTLP endpoint is fixed for now; change DefaultConfig or export fields later if you need env overrides.
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
		SentryTracesSampleRate: parseTracesSampleRate(BakedSentryTracesSampleRate),
	}
}

func parseTracesSampleRate(raw string) float64 {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 1.0
	}
	f, err := strconv.ParseFloat(raw, 64)
	if err != nil || f < 0 || f > 1 {
		return 1.0
	}
	return f
}

func (c Config) shouldInit() bool {
	if c.ServiceName == "" {
		return false
	}
	return c.OTLPEndpoint != "" || c.SentryDSN != ""
}
