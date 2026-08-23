package executor_test

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/capacity-controller/cluster"
	"eve-industry-planner/capacity-controller/config"
	"eve-industry-planner/capacity-controller/executor"
	"eve-industry-planner/capacity-controller/policy"
	"eve-industry-planner/capacity-controller/cluster/clusterfake"
)

// Management drill without Swarm: underutilized WS → cordon → drain → scale.
func TestManagementSim_websocketEvacuatePlaybook(t *testing.T) {
	now := time.Date(2026, 8, 9, 12, 0, 0, 0, time.UTC)
	cfg := config.Config{
		ScaleTiming: config.ScaleTiming{},
		Services: map[string]config.ServiceSpec{
			"worker":    {CapacityControllerManaged: true, Min: 1, Max: 2},
			"websocket": {CapacityControllerManaged: true, Min: 2, Max: 4, TargetClients: 1500, ReserveCapacity: 0.2},
			"api":       {CapacityControllerManaged: false, Min: 1, Max: 2},
		},
	}
	st := cluster.State{
		Services: map[cluster.Service]cluster.ServiceState{
			cluster.ServiceWebsocket: {
				DesiredReplicas:   3,
				Running:           3,
				Managed:           true,
				Min:               2,
				Max:               4,
				TargetClients:     1500,
				ReserveCapacity:   0.2,
				PressureDownSince: now.Add(-10 * time.Minute),
				Backends: []cluster.BackendState{
					{ContainerID: "a", Clients: 400, Ready: true, Healthy: true},
					{ContainerID: "b", Clients: 100, Ready: true, Healthy: true},
					{ContainerID: "c", Clients: 400, Ready: true, Healthy: true},
				},
			},
		},
	}
	fake := &clusterfake.Fake{State: st}
	ctx := context.Background()

	applyWS := func(plan policy.Plan) error {
		for _, a := range plan.Actions {
			switch a.Kind {
			case policy.KindCordon:
				if _, err := executor.Cordon(ctx, fake, fake.State, cluster.ServiceWebsocket, a.ContainerID); err != nil {
					return err
				}
			case policy.KindDrain:
				if _, err := executor.Drain(ctx, fake, fake.State, cluster.ServiceWebsocket, a.ContainerID); err != nil {
					return err
				}
			case policy.KindScale:
				desired, err := executor.RequireDesired(a.Desired)
				if err != nil {
					return err
				}
				if _, err := executor.Scale(ctx, fake, fake.State, cluster.ServiceWebsocket, desired); err != nil {
					return err
				}
			default:
				t.Fatalf("unexpected kind %q", a.Kind)
			}
		}
		return nil
	}

	// Step 1: cordon lowest-load backend.
	plan := policy.EvaluateService(cluster.ServiceWebsocket, fake.State, cfg, now)
	if len(plan.Actions) != 1 || plan.Actions[0].Kind != policy.KindCordon || plan.Actions[0].ContainerID != "b" {
		t.Fatalf("step1 cordon: %+v", plan)
	}
	if err := applyWS(plan); err != nil {
		t.Fatal(err)
	}

	// Step 2: drain cordoned backend (still has clients until Drain clears them).
	st2, _ := fake.Observe(ctx)
	ss := st2.Services[cluster.ServiceWebsocket]
	ss.PressureDownSince = now.Add(-10 * time.Minute)
	st2.Services[cluster.ServiceWebsocket] = ss
	fake.State = st2
	plan = policy.EvaluateService(cluster.ServiceWebsocket, fake.State, cfg, now)
	if len(plan.Actions) != 1 || plan.Actions[0].Kind != policy.KindDrain || plan.Actions[0].ContainerID != "b" {
		t.Fatalf("step2 drain: %+v", plan)
	}
	if err := applyWS(plan); err != nil {
		t.Fatal(err)
	}

	// Step 3: scale after draining empty.
	st3, _ := fake.Observe(ctx)
	ss = st3.Services[cluster.ServiceWebsocket]
	ss.PressureDownSince = now.Add(-10 * time.Minute)
	st3.Services[cluster.ServiceWebsocket] = ss
	fake.State = st3
	plan = policy.EvaluateService(cluster.ServiceWebsocket, fake.State, cfg, now)
	if len(plan.Actions) != 1 || plan.Actions[0].Kind != policy.KindScale || plan.Actions[0].Desired == nil || *plan.Actions[0].Desired != 2 {
		t.Fatalf("step3 scale: %+v", plan)
	}
	if err := applyWS(plan); err != nil {
		t.Fatal(err)
	}

	recs := fake.SnapshotRecords()
	if len(recs) != 3 || recs[0].Op != "cordon" || recs[1].Op != "drain" || recs[2].Op != "scale" {
		t.Fatalf("records=%v", recs)
	}
	if recs[2].Desired != 2 {
		t.Fatalf("desired=%d", recs[2].Desired)
	}
}
