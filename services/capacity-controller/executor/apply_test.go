package executor_test

import (
	"context"
	"testing"

	"eve-industry-planner/capacity-controller/cluster"
	"eve-industry-planner/capacity-controller/cluster/clusterfake"
	"eve-industry-planner/capacity-controller/executor"
)

func TestScale_managed(t *testing.T) {
	st := cluster.State{
		Services: map[cluster.Service]cluster.ServiceState{
			cluster.ServiceWorker: {Managed: true, Min: 1, Max: 2, DesiredReplicas: 1},
		},
	}
	fake := &clusterfake.Fake{State: st}
	ok, err := executor.Scale(context.Background(), fake, st, cluster.ServiceWorker, 2)
	if err != nil || !ok {
		t.Fatalf("ok=%v err=%v", ok, err)
	}
	recs := fake.SnapshotRecords()
	if len(recs) != 1 || recs[0].Op != "scale" || recs[0].Desired != 2 {
		t.Fatalf("records=%v", recs)
	}
}

func TestScale_skipsUnmanaged(t *testing.T) {
	st := cluster.State{
		Services: map[cluster.Service]cluster.ServiceState{
			cluster.ServiceWebsocket: {Managed: false, Min: 2, Max: 4, DesiredReplicas: 2},
		},
	}
	fake := &clusterfake.Fake{State: st}
	ok, err := executor.Scale(context.Background(), fake, st, cluster.ServiceWebsocket, 3)
	if err != nil || ok || len(fake.SnapshotRecords()) != 0 {
		t.Fatalf("ok=%v err=%v records=%v", ok, err, fake.SnapshotRecords())
	}
}
