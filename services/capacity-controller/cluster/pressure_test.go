package cluster

import "testing"

func TestWsClientPressure_idleStartsDownWithoutDraining(t *testing.T) {
	ss := ServiceState{
		DesiredReplicas: 2,
		Running:         2,
		Min:             1,
		Max:             5,
		TargetClients:   40,
		ReserveCapacity: 0.2,
		Backends: []BackendState{
			{ContainerID: "a", Clients: 0},
			{ContainerID: "b", Clients: 0},
		},
	}
	up, down := wsClientPressure(ss)
	if up {
		t.Fatalf("expected no up pressure when idle")
	}
	if !down {
		t.Fatalf("expected down pressure when underutilised with desired>min (scale-in playbook start)")
	}
}

func TestWsClientPressure_atMinNoDown(t *testing.T) {
	ss := ServiceState{
		DesiredReplicas: 1,
		Running:         1,
		Min:             1,
		TargetClients:   40,
		Backends:        []BackendState{{ContainerID: "a", Clients: 0}},
	}
	_, down := wsClientPressure(ss)
	if down {
		t.Fatalf("expected no down pressure at min replicas")
	}
}

func TestWsClientPressure_hotUp(t *testing.T) {
	ss := ServiceState{
		DesiredReplicas: 1,
		Running:         1,
		Min:             1,
		Max:             5,
		TargetClients:   40,
		ReserveCapacity: 0.2,
		Backends:        []BackendState{{ContainerID: "a", Clients: 80}},
	}
	up, down := wsClientPressure(ss)
	if !up {
		t.Fatalf("expected up pressure when avg above reserve threshold")
	}
	if down {
		t.Fatalf("expected no down while up")
	}
}
