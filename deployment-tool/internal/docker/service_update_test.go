package docker

import (
	"testing"

	"github.com/moby/moby/api/types/swarm"
)

func TestServiceIdleStuck(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		info ServiceInfo
		want bool
	}{
		{"running", ServiceInfo{Desired: 1, Running: 1}, false},
		{"starting", ServiceInfo{Desired: 1, Starting: 1}, false},
		{"scaled zero", ServiceInfo{Desired: 0, Running: 0, Starting: 0}, false},
		{"stuck shutdown", ServiceInfo{Desired: 1, Running: 0, Starting: 0}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := ServiceIdleStuck(tc.info); got != tc.want {
				t.Fatalf("got %v want %v", got, tc.want)
			}
		})
	}
}

func TestReplicatedDesired(t *testing.T) {
	t.Parallel()
	if replicatedDesired(swarm.Service{}) != 0 {
		t.Fatal("empty spec")
	}
	n := uint64(3)
	svc := swarm.Service{
		Spec: swarm.ServiceSpec{
			Mode: swarm.ServiceMode{
				Replicated: &swarm.ReplicatedService{Replicas: &n},
			},
		},
	}
	if got := replicatedDesired(svc); got != 3 {
		t.Fatalf("got %d", got)
	}
}
