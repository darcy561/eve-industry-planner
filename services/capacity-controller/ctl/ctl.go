// Package ctl is the in-container operator front door (Moby-exec from host eip).
package ctl

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"eve-industry-planner/capacity-controller/cluster"
	"eve-industry-planner/capacity-controller/config"
	"eve-industry-planner/capacity-controller/executor"
	"eve-industry-planner/capacity-controller/policy"
)

// Deps wires one-shot ctl commands.
type Deps struct {
	Cluster cluster.Cluster
	Cfg     func() config.Config
}

// Run dispatches ctl subcommands: status | plan | cordon | uncordon | drain | evacuate.
func Run(ctx context.Context, d Deps, args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("ctl: need subcommand (status|plan|cordon|uncordon|drain|evacuate)")
	}
	cmd := strings.ToLower(strings.TrimSpace(args[0]))
	rest := args[1:]
	switch cmd {
	case "status":
		return cmdStatus(ctx, d)
	case "plan":
		return cmdPlan(ctx, d)
	case "cordon":
		if len(rest) < 1 {
			return fmt.Errorf("ctl cordon: need container_id")
		}
		return d.Cluster.Cordon(ctx, rest[0])
	case "uncordon":
		if len(rest) < 1 {
			return fmt.Errorf("ctl uncordon: need container_id")
		}
		return d.Cluster.Uncordon(ctx, rest[0])
	case "drain":
		if len(rest) < 1 {
			return fmt.Errorf("ctl drain: need container_id")
		}
		return d.Cluster.Drain(ctx, rest[0])
	case "evacuate":
		if len(rest) < 1 {
			return fmt.Errorf("ctl evacuate: need container_id")
		}
		return cmdEvacuate(ctx, d, rest[0])
	default:
		return fmt.Errorf("ctl: unknown %q", cmd)
	}
}

func cmdStatus(ctx context.Context, d Deps) error {
	st, err := d.Cluster.Observe(ctx)
	if err != nil {
		return err
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(map[string]any{
		"services": st.Services,
	})
}

func cmdPlan(ctx context.Context, d Deps) error {
	st, err := d.Cluster.Observe(ctx)
	if err != nil {
		return err
	}
	cfg := config.Config{}
	if d.Cfg != nil {
		cfg = d.Cfg()
	}
	plan := policy.Evaluate(st, cfg, time.Now().UTC())
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(plan)
}

// cmdEvacuate runs cordon → drain → scale desired-1 for websocket.
func cmdEvacuate(ctx context.Context, d Deps, containerID string) error {
	st, err := d.Cluster.Observe(ctx)
	if err != nil {
		return err
	}
	ss, ok := st.Services[cluster.ServiceWebsocket]
	if !ok {
		return fmt.Errorf("ctl evacuate: no websocket service state")
	}
	found := false
	for _, b := range ss.Backends {
		if b.ContainerID == containerID {
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("ctl evacuate: container_id %q not in Observe backends", containerID)
	}
	if ss.DesiredReplicas <= ss.Min {
		return fmt.Errorf("ctl evacuate: desired %d at min %d", ss.DesiredReplicas, ss.Min)
	}

	if err := d.Cluster.Cordon(ctx, containerID); err != nil {
		return fmt.Errorf("cordon: %w", err)
	}
	if err := d.Cluster.Drain(ctx, containerID); err != nil {
		return fmt.Errorf("drain: %w", err)
	}
	next := ss.DesiredReplicas - 1
	// Operator evacuate forces managed so unmanaged YAML does not block Scale.
	st.Services[cluster.ServiceWebsocket] = func() cluster.ServiceState {
		r := ss
		r.Managed = true
		return r
	}()
	ok, err = executor.Scale(ctx, d.Cluster, st, cluster.ServiceWebsocket, next)
	if err != nil {
		return err
	}
	n := 0
	if ok {
		n = 1
	}
	fmt.Fprintf(os.Stdout, "evacuated %s; scale mutations=%d desired=%d\n", containerID, n, next)
	return nil
}
