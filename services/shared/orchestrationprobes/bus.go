package orchestrationprobes

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"

	natslib "github.com/nats-io/nats.go"
)

// StatusFill enriches a HealthStatus after ready/healthy are set (role-specific census fields).
// Callers must not mutate Role / InstanceID / Healthy / Ready / Error / TimeUnixMs except via fill needs.
type StatusFill func(status *eipnats.HealthStatus)

// BusOptions configures the gated health census responder (controller poll / scatter-gather).
// Enabled defaults to false — no subscription until a controller path flips it on.
type BusOptions struct {
	Role       string
	InstanceID string
	Conn       *natslib.Conn
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
	if opts.Conn == nil {
		return nil, fmt.Errorf("orchestrationprobes: Bus Conn required when Enabled")
	}
	if opts.Role == "" {
		return nil, fmt.Errorf("orchestrationprobes: Bus Role required when Enabled")
	}
	if opts.InstanceID == "" {
		return nil, fmt.Errorf("orchestrationprobes: Bus InstanceID required when Enabled")
	}

	sub, err := opts.Conn.Subscribe(eipnats.SubjectHealthCommandPing, func(msg *natslib.Msg) {
		handleHealthPing(opts, msg)
	})
	if err != nil {
		return nil, fmt.Errorf("orchestrationprobes: subscribe %s: %w", eipnats.SubjectHealthCommandPing, err)
	}
	logs.InfoCtx(ctx, "orchestration probes NATS health bus enabled",
		"subject", eipnats.SubjectHealthCommandPing,
		"role", opts.Role,
		"instance_id", opts.InstanceID,
	)

	return lifecycle.Func{
		RunnerName: "orchestrationprobes-bus",
		Fn: func(context.Context) {
			_ = sub.Unsubscribe()
		},
	}, nil
}

func handleHealthPing(opts BusOptions, msg *natslib.Msg) {
	if msg == nil {
		return
	}
	if role, ok := parseHealthPingRole(msg.Data); ok && role != "" && role != opts.Role {
		return
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

	if err := eipnats.RespondEnvelope(msg, eipnats.MessageTypeHealth, status); err != nil {
		logs.WarnCtx(context.Background(), "orchestration probes health Respond failed",
			"error", err,
			"role", opts.Role,
			"instance_id", opts.InstanceID,
		)
	}
}

// parseHealthPingRole returns (role, true) when Data carries a HealthPing (raw or Message envelope).
// Empty data → ("", true) meaning all roles.
func parseHealthPingRole(data []byte) (string, bool) {
	if len(data) == 0 {
		return "", true
	}
	var env eipnats.Message
	if err := json.Unmarshal(data, &env); err == nil && env.Type != "" {
		if len(env.Data) == 0 {
			return "", true
		}
		var ping eipnats.HealthPing
		if err := json.Unmarshal(env.Data, &ping); err != nil {
			return "", true
		}
		return ping.Role, true
	}
	var ping eipnats.HealthPing
	if err := json.Unmarshal(data, &ping); err != nil {
		return "", true
	}
	return ping.Role, true
}
