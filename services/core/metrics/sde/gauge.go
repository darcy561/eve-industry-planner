package sde

import (
	"context"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"

	"eve-industry-planner/core/metrics/common"
	"eve-industry-planner/shared/logs"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

var (
	registerOnce sync.Once
	currentBuild atomic.Int64
	versionMu    sync.RWMutex
	currentVer   = "unknown"
)

// Register registers the core SDE build gauge backed by an in-process cached value.
func Register() {
	registerOnce.Do(func() {
		m := common.Meter()
		gBuild, err := m.Int64ObservableGauge("core.sde.current_build_number",
			metric.WithUnit("1"),
			metric.WithDescription("Current SDE build number set by core startup/task flows."),
		)
		if err != nil {
			logs.ErrorCtx(context.Background(), "core metrics sde: current_build_number gauge", "error", err)
			return
		}
		gVersionInfo, err := m.Int64ObservableGauge("core.sde.current_version_info",
			metric.WithUnit("1"),
			metric.WithDescription("Info metric for current SDE version string and build number labels."),
		)
		if err != nil {
			logs.ErrorCtx(context.Background(), "core metrics sde: current_build_number gauge", "error", err)
			return
		}
		_, err = m.RegisterCallback(func(ctx context.Context, o metric.Observer) error {
			build := currentBuild.Load()
			versionMu.RLock()
			version := currentVer
			versionMu.RUnlock()
			o.ObserveInt64(gBuild, build)
			o.ObserveInt64(gVersionInfo, 1, metric.WithAttributes(
				attribute.String("version", version),
				attribute.String("build_number", strconv.FormatInt(build, 10)),
			))
			return nil
		}, gBuild, gVersionInfo)
		if err != nil {
			logs.ErrorCtx(context.Background(), "core metrics sde: register callback", "error", err)
		}
	})
}

// SetCurrentBuild updates the cached SDE build value exposed by the gauge.
func SetCurrentBuild(build int) {
	SetCurrentVersion(build, "")
}

// SetCurrentVersion updates cached SDE build and semantic version string.
func SetCurrentVersion(build int, version string) {
	if build <= 0 {
		return
	}
	currentBuild.Store(int64(build))
	if v := strings.TrimSpace(version); v != "" {
		versionMu.Lock()
		currentVer = v
		versionMu.Unlock()
	}
}
