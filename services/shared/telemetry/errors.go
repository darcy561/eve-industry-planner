package telemetry

import "errors"

var (
	errEmptyEndpoint = errors.New("telemetry: OTLP endpoint is empty")
	errNoHost        = errors.New("telemetry: OTLP URL has no host")
)
