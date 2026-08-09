package policy_test

import (
	"testing"
	"time"

	"eve-industry-planner/capacity-controller/cluster"
	"eve-industry-planner/capacity-controller/config"
	"eve-industry-planner/capacity-controller/policy"
)

func timing() config.ScaleTiming {
	return config.ScaleTiming{
		Cooldown:               config.Duration(2 * time.Minute),
		ScaleUpStabilization:   config.Duration(time.Minute),
		ScaleDownStabilization: config.Duration(5 * time.Minute),
	}
}

func baseCfg() config.Config {
	return config.Config{
		ScaleTiming: timing(),
		Services: map[string]config.ServiceSpec{
			"worker": {
				CapacityControllerManaged: true,
				Min:                       1,
				Max:                       2,
				Concurrency:               50,
			},
			"websocket": {
				CapacityControllerManaged: false,
				Min:                       2,
				Max:                       4,
				TargetClients:             1500,
				ReserveCapacity:           0.2,
			},
			"api": {
				CapacityControllerManaged: true,
				Min:                       1,
				Max:                       4,
			},
		},
	}
}

func TestEvaluate_workerHighPendingScalesUp(t *testing.T) {
	now := time.Date(2026, 8, 9, 12, 0, 0, 0, time.UTC)
	// slots=50; priority_1 threshold 10% → need pending > 5
	st := cluster.State{
		Services: map[cluster.Service]cluster.ServiceState{
			cluster.ServiceWorker: {
				DesiredReplicas:   1,
				Running:           1,
				Concurrency:       50,
				QueueDepth:        6,
				QueuePending:      map[string]int{"priority_1": 6},
				QueueDepthKnown:   true,
				Managed:           true,
				Min:               1,
				Max:               2,
				PressureUpSince:   now.Add(-2 * time.Minute),
				PressureDownSince: time.Time{},
			},
		},
	}
	plan := policy.EvaluateService(cluster.ServiceWorker, st, baseCfg(), now)
	if len(plan.Actions) != 1 || plan.Actions[0].Kind != policy.KindScale || plan.Actions[0].Desired == nil || *plan.Actions[0].Desired != 2 {
		t.Fatalf("plan=%+v", plan)
	}
}

func TestEvaluate_workerBulkPendingDoesNotScaleUp(t *testing.T) {
	now := time.Date(2026, 8, 9, 12, 0, 0, 0, time.UTC)
	// slots=50; priority_5 threshold 200% → 100 pending is under bar
	st := cluster.State{
		Services: map[cluster.Service]cluster.ServiceState{
			cluster.ServiceWorker: {
				DesiredReplicas: 1,
				Running:         1,
				Concurrency:     50,
				QueueDepth:      100,
				QueuePending:    map[string]int{"priority_5": 100},
				QueueDepthKnown: true,
				Managed:         true,
				Min:             1,
				Max:             2,
				PressureUpSince: now.Add(-2 * time.Minute),
			},
		},
	}
	plan := policy.EvaluateService(cluster.ServiceWorker, st, baseCfg(), now)
	if len(plan.Actions) != 0 {
		t.Fatalf("want hold for bulk under threshold, got %+v", plan)
	}
}

func TestEvaluate_workerAtMaxHolds(t *testing.T) {
	now := time.Date(2026, 8, 9, 12, 0, 0, 0, time.UTC)
	st := cluster.State{
		Services: map[cluster.Service]cluster.ServiceState{
			cluster.ServiceWorker: {
				DesiredReplicas: 2,
				Running:         2,
				Concurrency:     50,
				QueueDepth:      50,
				QueuePending:    map[string]int{"priority_1": 50},
				QueueDepthKnown: true,
				Managed:         true,
				Min:             1,
				Max:             2,
				PressureUpSince: now.Add(-2 * time.Minute),
			},
		},
	}
	plan := policy.EvaluateService(cluster.ServiceWorker, st, baseCfg(), now)
	if len(plan.Actions) != 0 {
		t.Fatalf("want hold, got %+v", plan)
	}
}

func TestEvaluate_workerUnmanagedHolds(t *testing.T) {
	now := time.Date(2026, 8, 9, 12, 0, 0, 0, time.UTC)
	st := cluster.State{
		Services: map[cluster.Service]cluster.ServiceState{
			cluster.ServiceWorker: {
				DesiredReplicas: 1,
				Running:         1,
				Concurrency:     50,
				QueueDepth:      50,
				QueuePending:    map[string]int{"priority_1": 50},
				QueueDepthKnown: true,
				Managed:         false,
				Min:             1,
				Max:             2,
				PressureUpSince: now.Add(-2 * time.Minute),
			},
		},
	}
	plan := policy.EvaluateService(cluster.ServiceWorker, st, baseCfg(), now)
	if len(plan.Actions) != 0 {
		t.Fatalf("want hold, got %+v", plan)
	}
}

func TestEvaluate_workerIdleScalesDown(t *testing.T) {
	now := time.Date(2026, 8, 9, 12, 0, 0, 0, time.UTC)
	st := cluster.State{
		Services: map[cluster.Service]cluster.ServiceState{
			cluster.ServiceWorker: {
				DesiredReplicas:   2,
				Running:           2,
				Concurrency:       50,
				QueueDepth:        0,
				QueueDepthKnown:   true,
				ActiveTasks:       10, // <= 50*(2-1)
				Managed:           true,
				Min:               1,
				Max:               2,
				PressureDownSince: now.Add(-10 * time.Minute),
			},
		},
	}
	plan := policy.EvaluateService(cluster.ServiceWorker, st, baseCfg(), now)
	if len(plan.Actions) != 1 || plan.Actions[0].Desired == nil || *plan.Actions[0].Desired != 1 {
		t.Fatalf("plan=%+v", plan)
	}
}

func TestEvaluate_cooldownHolds(t *testing.T) {
	now := time.Date(2026, 8, 9, 12, 0, 0, 0, time.UTC)
	st := cluster.State{
		Services: map[cluster.Service]cluster.ServiceState{
			cluster.ServiceWorker: {
				DesiredReplicas: 1,
				Running:         1,
				Concurrency:     50,
				QueueDepth:      20,
				QueuePending:    map[string]int{"priority_1": 20},
				QueueDepthKnown: true,
				Managed:         true,
				Min:             1,
				Max:             2,
				PressureUpSince: now.Add(-2 * time.Minute),
				Cooldown:        cluster.CooldownState{LastApplyAt: now.Add(-30 * time.Second)},
			},
		},
	}
	plan := policy.EvaluateService(cluster.ServiceWorker, st, baseCfg(), now)
	if len(plan.Actions) != 0 || plan.Summary != "cooldown" {
		t.Fatalf("want cooldown hold, got %+v", plan)
	}
}

func TestEvaluate_workerCooldownDoesNotBlockWebsocket(t *testing.T) {
	now := time.Date(2026, 8, 9, 12, 0, 0, 0, time.UTC)
	st := cluster.State{
		Services: map[cluster.Service]cluster.ServiceState{
			cluster.ServiceWorker: {
				DesiredReplicas: 1,
				Running:         1,
				Concurrency:     50,
				QueueDepth:      20,
				QueuePending:    map[string]int{"priority_1": 20},
				QueueDepthKnown: true,
				Managed:         true,
				Min:             1,
				Max:             2,
				PressureUpSince: now.Add(-2 * time.Minute),
				Cooldown:        cluster.CooldownState{LastApplyAt: now.Add(-30 * time.Second)},
			},
			cluster.ServiceWebsocket: {
				DesiredReplicas: 2,
				Running:         2,
				Managed:         false,
				Min:             2,
				Max:             4,
				TargetClients:   1500,
				ReserveCapacity: 0.2,
				PressureUpSince: now.Add(-2 * time.Minute),
				Backends: []cluster.BackendState{
					{ContainerID: "a", Clients: 1350, Ready: true, Healthy: true},
					{ContainerID: "b", Clients: 1350, Ready: true, Healthy: true},
				},
			},
		},
	}
	wPlan := policy.EvaluateService(cluster.ServiceWorker, st, baseCfg(), now)
	if len(wPlan.Actions) != 0 || wPlan.Summary != "cooldown" {
		t.Fatalf("worker want cooldown, got %+v", wPlan)
	}
	wsPlan := policy.EvaluateService(cluster.ServiceWebsocket, st, baseCfg(), now)
	if len(wsPlan.Actions) != 1 || wsPlan.Actions[0].Service != cluster.ServiceWebsocket || wsPlan.Actions[0].Desired == nil || *wsPlan.Actions[0].Desired != 3 {
		t.Fatalf("websocket want scale, got %+v", wsPlan)
	}
}

func TestEvaluate_websocketReserveScalesUp(t *testing.T) {
	// avg 1350 > 1500*(1-0.2)=1200 → scale 2→3 (Evaluate may plan while Managed is false)
	now := time.Date(2026, 8, 9, 12, 0, 0, 0, time.UTC)
	st := cluster.State{
		Services: map[cluster.Service]cluster.ServiceState{
			cluster.ServiceWebsocket: {
				DesiredReplicas: 2,
				Running:         2,
				Managed:         false,
				Min:             2,
				Max:             4,
				TargetClients:   1500,
				ReserveCapacity: 0.2,
				PressureUpSince: now.Add(-2 * time.Minute),
				Backends: []cluster.BackendState{
					{ContainerID: "a", Clients: 1350, Ready: true, Healthy: true},
					{ContainerID: "b", Clients: 1350, Ready: true, Healthy: true},
				},
			},
		},
	}
	plan := policy.EvaluateService(cluster.ServiceWebsocket, st, baseCfg(), now)
	if len(plan.Actions) != 1 || plan.Actions[0].Service != cluster.ServiceWebsocket || plan.Actions[0].Desired == nil || *plan.Actions[0].Desired != 3 {
		t.Fatalf("plan=%+v", plan)
	}
}

func TestEvaluate_websocketDrainingEmptyScalesDown(t *testing.T) {
	// three backends @ ~30% of 1500 (=450), one draining empty → scale 3→2
	now := time.Date(2026, 8, 9, 12, 0, 0, 0, time.UTC)
	st := cluster.State{
		Services: map[cluster.Service]cluster.ServiceState{
			cluster.ServiceWebsocket: {
				DesiredReplicas:   3,
				Running:           3,
				Managed:           false,
				Min:               2,
				Max:               4,
				TargetClients:     1500,
				ReserveCapacity:   0.2,
				PressureDownSince: now.Add(-10 * time.Minute),
				Backends: []cluster.BackendState{
					{ContainerID: "a", Clients: 450, Ready: true, Healthy: true},
					{ContainerID: "b", Clients: 450, Ready: true, Healthy: true},
					{ContainerID: "c", Clients: 0, Draining: true, Ready: true, Healthy: true},
				},
			},
		},
	}
	plan := policy.EvaluateService(cluster.ServiceWebsocket, st, baseCfg(), now)
	if len(plan.Actions) != 1 || plan.Actions[0].Desired == nil || *plan.Actions[0].Desired != 2 {
		t.Fatalf("plan=%+v", plan)
	}
}

func TestEvaluate_websocketUnderutilizedCordonsLowest(t *testing.T) {
	now := time.Date(2026, 8, 9, 12, 0, 0, 0, time.UTC)
	st := cluster.State{
		Services: map[cluster.Service]cluster.ServiceState{
			cluster.ServiceWebsocket: {
				DesiredReplicas:   3,
				Running:           3,
				Managed:           false,
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
	plan := policy.EvaluateService(cluster.ServiceWebsocket, st, baseCfg(), now)
	if len(plan.Actions) != 1 || plan.Actions[0].Kind != policy.KindCordon || plan.Actions[0].ContainerID != "b" {
		t.Fatalf("want cordon b, got %+v", plan)
	}
}

func TestEvaluate_unknownQueueDepthHolds(t *testing.T) {
	now := time.Date(2026, 8, 9, 12, 0, 0, 0, time.UTC)
	st := cluster.State{
		Services: map[cluster.Service]cluster.ServiceState{
			cluster.ServiceWorker: {
				DesiredReplicas: 1,
				Running:         1,
				Concurrency:     50,
				QueueDepthKnown: false,
				Managed:         true,
				Min:             1,
				Max:             2,
			},
		},
	}
	plan := policy.EvaluateService(cluster.ServiceWorker, st, baseCfg(), now)
	if len(plan.Actions) != 0 || plan.Summary != "missing queue depth" {
		t.Fatalf("want missing queue depth hold, got %+v", plan)
	}
}
