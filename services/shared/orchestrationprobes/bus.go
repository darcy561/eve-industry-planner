package orchestrationprobes

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
)

// StatusFill enriches a HealthStatus after ready/healthy are set (role-specific census fields).
// Callers must not mutate Role / InstanceID / Healthy / Ready / Error / TimeUnixMs except via fill needs.
type StatusFill func(status *eipnats.HealthStatus)

// BusOptions configures the gated health census responder (controller poll / scatter-gather).
// Enabled defaults to false — no subscription until a controller path flips it on.
type BusOptions struct {
	Role       string
	InstanceID string
	NATS       *eipnats.NATS
	Ready      ReadyCheck
	Enabled    bool
	Fill       StatusFill // optional; websocket/worker census without importing those packages here
}

// StartBus subscribes to health.command.ping when Enabled. Otherwise returns a no-op Runner.
// Do not use a queue group — every replica must Respond for fleet census.
func StartBus(ctx context.Context, opts BusOptions) (lifecycle.Runner, error) {
	if !opts.Enabled {
		return lifecycle.Func{RunnerName: "orchestrationprobes-bus-disabled", Fn: func(context.Context) {}}, nil
	}
	if opts.NATS == nil {
		return nil, fmt.Errorf("orchestrationprobes: Bus NATS handle required when Enabled")
	}
	if opts.Role == "" {
		return nil, fmt.Errorf("orchestrationprobes: Bus Role required when Enabled")
	}
	if opts.InstanceID == "" {
		return nil, fmt.Errorf("orchestrationprobes: Bus InstanceID required when Enabled")
	}

	stop, err := eipnats.SubscribeHealthPings(opts.NATS, func(ping eipnats.HealthPing) (eipnats.HealthStatus, bool) {
		return healthStatus(opts, ping)
	})
	if err != nil {
		return nil, fmt.Errorf("orchestrationprobes: subscribe health pings: %w", err)
	}
	logs.InfoCtx(ctx, "orchestration probes NATS health bus enabled",
		"subject", eipnats.SubjectHealthCommandPing,
		"role", opts.Role,
		"instance_id", opts.InstanceID,
	)

	return lifecycle.Func{
		RunnerName: "orchestrationprobes-bus",
		Fn:         func(context.Context) { stop() },
	}, nil
}

// healthStatus answers the census for this replica. A ping naming another role
// is not ours to answer.
func healthStatus(opts BusOptions, ping eipnats.HealthPing) (eipnats.HealthStatus, bool) {
	if ping.Role != "" && ping.Role != opts.Role {
		return eipnats.HealthStatus{}, false
	}

	status := eipnats.HealthStatus{
		Role:       opts.Role,
		InstanceID: opts.InstanceID,
		Healthy:    true,
		TimeUnixMs: time.Now().UnixMilli(),
	}
	if opts.Ready == nil {
		status.Ready = false
		status.Error = "ready check not configured"
	} else {
		rctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		err := opts.Ready(rctx)
		cancel()
		if err != nil {
			status.Ready = false
			status.Error = err.Error()
		} else {
			status.Ready = true
		}
	}
	if opts.Fill != nil {
		opts.Fill(&status)
	}
	return status, true
}
