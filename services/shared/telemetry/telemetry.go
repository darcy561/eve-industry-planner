package telemetry

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/getsentry/sentry-go"
	sentryotel "github.com/getsentry/sentry-go/otel"
	sentryotlp "github.com/getsentry/sentry-go/otel/otlp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploggrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc"
	logglobal "go.opentelemetry.io/otel/log/global"
	"go.opentelemetry.io/otel/propagation"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	oteltrace "go.opentelemetry.io/otel/trace"

	"eve-industry-planner/shared/container"
	"eve-industry-planner/shared/logs"
)

// Init installs global TracerProvider and MeterProvider when Config.shouldInit is true.
// Traces are exported to Sentry via OTLP when SentryDSN is set and SentryTracesSampleRate > 0.
// App OTLP remains for metrics and logs to the collector when OTLPEndpoint is set.
// It returns a shutdown function that flushes providers (and Sentry when configured).
// Call shutdown on process exit with a timeout context.
func Init(ctx context.Context, cfg Config) (func(context.Context) error, error) {
	if !cfg.shouldInit() {
		return func(context.Context) error { return nil }, nil
	}

	sentryStarted := false
	// OTel spans are exported to Sentry only when TracesSampleRate > 0; errors still use Sentry when DSN is set.
	sentrySendTraces := cfg.SentryDSN != "" && cfg.SentryTracesSampleRate > 0
	if cfg.SentryDSN != "" {
		sr := cfg.SentryTracesSampleRate
		if sentrySendTraces && sr > 1 {
			sr = 1.0
		}
		if !sentrySendTraces {
			sr = 0
		}
		envMode := strings.TrimSpace(cfg.SentryEnvironment)
		release := strings.TrimSpace(cfg.SentryRelease)
		if release == "" {
			release = "development"
		}
		if err := sentry.Init(sentry.ClientOptions{
			Dsn:              cfg.SentryDSN,
			Environment:      envMode,
			Release:          release,
			EnableTracing:    sentrySendTraces,
			TracesSampleRate: sr,
			SampleRate:       1.0,
			// Do not drop events by environment here: use a separate Sentry project/DSN for dev,
			// or filter by the "environment" tag in Sentry. Dropping all "development" events
			// made production-looking deploys (e.g. mis-set build ARG) send nothing.
			Integrations: func(integrations []sentry.Integration) []sentry.Integration {
				return append(integrations, sentryotel.NewOtelIntegration())
			},
		}); err != nil {
			return nil, fmt.Errorf("telemetry: sentry.Init: %w", err)
		}
		sentryStarted = true
	}

	// sentry-go ≥0.47 removed NewSentryPropagator; use W3C TraceContext/Baggage for OTel↔OTel
	// (and frontend→backend when the browser SDK sends traceparent).
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	version := strings.TrimSpace(cfg.ServiceVersion)
	if version == "" {
		version = strings.TrimSpace(cfg.SentryRelease)
	}
	if version == "" {
		version = "unknown"
	}
	// service.instance.id = short container id (HOSTNAME). Prom labels via Alloy
	// resource_to_telemetry_conversion (service_name + service_instance_id).
	instanceID := container.ID()

	res, err := resource.New(ctx,
		resource.WithAttributes(
			attribute.String("service.name", cfg.ServiceName),
			attribute.String("service.version", version),
			attribute.String("service.instance.id", instanceID),
			// Loki label for LogQL dashboards ({compose_service="api"}, etc.).
			attribute.String("compose_service", cfg.ServiceName),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("telemetry: resource: %w", err)
	}

	var traceShutdown func(context.Context) error
	if sentrySendTraces {
		exporter, err := sentryotlp.NewTraceExporter(ctx, cfg.SentryDSN)
		if err != nil {
			return nil, fmt.Errorf("telemetry: sentry otlp trace exporter: %w", err)
		}
		sr := cfg.SentryTracesSampleRate
		if sr > 1 {
			sr = 1.0
		}
		tp := sdktrace.NewTracerProvider(
			sdktrace.WithResource(res),
			sdktrace.WithBatcher(exporter),
			// OTLP export does not apply sentry.TracesSampleRate; sample in the SDK.
			sdktrace.WithSampler(sdktrace.ParentBased(sdktrace.TraceIDRatioBased(sr))),
		)
		otel.SetTracerProvider(tp)
		traceShutdown = tp.Shutdown
	} else {
		// No Sentry trace export; noop avoids exporting spans when tracing is off (errors-only).
		otel.SetTracerProvider(oteltrace.NewNoopTracerProvider())
		traceShutdown = func(context.Context) error { return nil }
	}

	var lp *sdklog.LoggerProvider
	if cfg.OTLPEndpoint != "" {
		hostport, err := normalizeOTLPEndpoint(cfg.OTLPEndpoint)
		if err != nil {
			return nil, err
		}
		lopts := []otlploggrpc.Option{otlploggrpc.WithEndpoint(hostport)}
		if cfg.OTLPInsecure {
			lopts = append(lopts, otlploggrpc.WithInsecure())
		}
		le, err := otlploggrpc.New(ctx, lopts...)
		if err != nil {
			return nil, fmt.Errorf("telemetry: otlp log exporter: %w", err)
		}
		lp = sdklog.NewLoggerProvider(
			sdklog.WithResource(res),
			sdklog.WithProcessor(sdklog.NewBatchProcessor(le)),
		)
		logglobal.SetLoggerProvider(lp)
		logs.EnableOTLPExport()
	}

	var mp *sdkmetric.MeterProvider
	if cfg.OTLPEndpoint != "" {
		hostport, err := normalizeOTLPEndpoint(cfg.OTLPEndpoint)
		if err != nil {
			return nil, err
		}
		mopts := []otlpmetricgrpc.Option{otlpmetricgrpc.WithEndpoint(hostport)}
		if cfg.OTLPInsecure {
			mopts = append(mopts, otlpmetricgrpc.WithInsecure())
		}
		me, err := otlpmetricgrpc.New(ctx, mopts...)
		if err != nil {
			return nil, fmt.Errorf("telemetry: otlp metric exporter: %w", err)
		}
		exportEvery := cfg.MetricExportInterval
		if exportEvery <= 0 {
			exportEvery = DefaultMetricExportInterval
		}
		reader := sdkmetric.NewPeriodicReader(me, sdkmetric.WithInterval(exportEvery))
		mp = sdkmetric.NewMeterProvider(
			sdkmetric.WithResource(res),
			sdkmetric.WithReader(reader),
		)
		otel.SetMeterProvider(mp)
	}

	return func(shutdownCtx context.Context) error {
		var errs []error
		if err := traceShutdown(shutdownCtx); err != nil {
			errs = append(errs, fmt.Errorf("telemetry: trace shutdown: %w", err))
		}
		if lp != nil {
			if err := lp.Shutdown(shutdownCtx); err != nil {
				errs = append(errs, fmt.Errorf("telemetry: log shutdown: %w", err))
			}
		}
		if mp != nil {
			if err := mp.Shutdown(shutdownCtx); err != nil {
				errs = append(errs, fmt.Errorf("telemetry: metric shutdown: %w", err))
			}
		}
		if sentryStarted {
			sentry.Flush(2 * time.Second)
		}
		return errors.Join(errs...)
	}, nil
}
