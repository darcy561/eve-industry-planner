package logs

import "sync/atomic"

var otlpExportEnabled atomic.Bool

// EnableOTLPExport switches the root logger to OTLP export (JSON log body) instead of stdout.
// Called from telemetry.Init after a real LoggerProvider is installed.
func EnableOTLPExport() {
	otlpExportEnabled.Store(true)
	ResetRoot()
}

// DisableOTLPExport restores stdout logging (e.g. tests).
func DisableOTLPExport() {
	otlpExportEnabled.Store(false)
	ResetRoot()
}

func useOTLPExport() bool {
	return otlpExportEnabled.Load()
}
