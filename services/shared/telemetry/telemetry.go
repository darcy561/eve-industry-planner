package telemetry

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/getsentry/sentry-go"
	sentryotel "github.com/getsentry/sentry-go/otel"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploggrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	logglobal "go.opentelemetry.io/otel/log/global"
	"go.opentelemetry.io/otel/propagation"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"

	"eve-industry-planner/shared/logs"
)

// Init installs global TracerProvider and MeterProvider when Config.shouldInit is true.
// It returns a shutdown function that flushes providers (and Sentry when configured).
// Call shutdown on process exit with a timeout context.
func Init(ctx context.Context, cfg Config) (func(context.Context) error, error) {
	if !cfg.shouldInit() {
		return func(context.Context) error { return nil }, nil
	}

	sentryStarted := false
	if cfg.SentryDSN != "" {
		sr := cfg.SentryTracesSampleRate
		if sr <= 0 {
			sr = 1.0
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
			EnableTracing:    true,
			TracesSampleRate: sr,
			SampleRate:       1.0,
			BeforeSend: func(event *sentry.Event, _ *sentry.EventHint) *sentry.Event {
				if strings.EqualFold(envMode, "development") {
					return nil
				}
				return event
			},
		}); err != nil {
			return nil, fmt.Errorf("telemetry: sentry.Init: %w", err)
		}
		sentryStarted = true
	}

	if cfg.SentryDSN != "" {
		otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
			sentryotel.NewSentryPropagator(),
			propagation.TraceContext{},
			propagation.Baggage{},
		))
	} else {
		otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
			propagation.TraceContext{},
			propagation.Baggage{},
		))
	}

	version := cfg.ServiceVersion
	if version == "" {
		version = "unknown"
	}

	res, err := resource.New(ctx,
		resource.WithTelemetrySDK(),
		resource.WithHost(),
		resource.WithAttributes(
			attribute.String("service.name", cfg.ServiceName),
			attribute.String("service.version", version),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("telemetry: resource: %w", err)
	}

	traceOpts := []sdktrace.TracerProviderOption{
		sdktrace.WithResource(res),
	}
	if cfg.SentryDSN != "" {
		traceOpts = append(traceOpts, sdktrace.WithSpanProcessor(sentryotel.NewSentrySpanProcessor()))
	}
	if cfg.OTLPEndpoint != "" {
		hostport, err := normalizeOTLPEndpoint(cfg.OTLPEndpoint)
		if err != nil {
			return nil, err
		}
		topts := []otlptracegrpc.Option{otlptracegrpc.WithEndpoint(hostport)}
		if cfg.OTLPInsecure {
			topts = append(topts, otlptracegrpc.WithInsecure())
		}
		te, err := otlptracegrpc.New(ctx, topts...)
		if err != nil {
			return nil, fmt.Errorf("telemetry: otlp trace exporter: %w", err)
		}
		traceOpts = append(traceOpts, sdktrace.WithBatcher(te))
	}

	tp := sdktrace.NewTracerProvider(traceOpts...)
	otel.SetTracerProvider(tp)

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
		logs.ResetRoot()
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
		if err := tp.Shutdown(shutdownCtx); err != nil {
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
