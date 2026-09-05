// Package clusterfake is a recording in-memory cluster.Cluster for capacity-controller tests.
// Not linked into the capacity-controller product binary.
package clusterfake

import (
	"context"
	"sync"

	"eve-industry-planner/capacity-controller/cluster"
)

// ApplyRecord is one mutation recorded by Fake.
type ApplyRecord struct {
	Op          string // "scale" | "cordon" | "drain" | "uncordon"
	Service     cluster.Service
	Desired     int
	ContainerID string
}

// Fake is an in-memory Cluster for unit tests and management sims.
type Fake struct {
	mu      sync.Mutex
	State   cluster.State
	Records []ApplyRecord
}

// Observe returns a copy of the current fake state.
func (f *Fake) Observe(context.Context) (cluster.State, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return cloneState(f.State), nil
}

// Scale records a scale Apply.
func (f *Fake) Scale(_ context.Context, svc cluster.Service, desired int) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.Records = append(f.Records, ApplyRecord{Op: "scale", Service: svc, Desired: desired})
	if f.State.Services == nil {
		f.State.Services = map[cluster.Service]cluster.ServiceState{}
	}
	ss := f.State.Services[svc]
	ss.DesiredReplicas = desired
	f.State.Services[svc] = ss
	return nil
}

// Cordon records a cordon Apply and marks the matching backend draining.
func (f *Fake) Cordon(_ context.Context, containerID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.Records = append(f.Records, ApplyRecord{Op: "cordon", ContainerID: containerID})
	f.markBackend(containerID, true, false)
	return nil
}

// Drain records a drain Apply and clears clients on the matching backend.
func (f *Fake) Drain(_ context.Context, containerID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.Records = append(f.Records, ApplyRecord{Op: "drain", ContainerID: containerID})
	f.markBackend(containerID, true, true)
	return nil
}

// Uncordon records an uncordon Apply and clears draining on the matching backend.
func (f *Fake) Uncordon(_ context.Context, containerID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.Records = append(f.Records, ApplyRecord{Op: "uncordon", ContainerID: containerID})
	if f.State.Services == nil {
		return nil
	}
	for svc, ss := range f.State.Services {
		for i := range ss.Backends {
			if ss.Backends[i].ContainerID == containerID {
				ss.Backends[i].Draining = false
				f.State.Services[svc] = ss
				return nil
			}
		}
	}
	return nil
}

func (f *Fake) markBackend(containerID string, draining, clearClients bool) {
	if f.State.Services == nil {
		return
	}
	for svc, ss := range f.State.Services {
		for i := range ss.Backends {
			if ss.Backends[i].ContainerID == containerID {
				ss.Backends[i].Draining = draining
				if clearClients {
					ss.Backends[i].Clients = 0
				}
				f.State.Services[svc] = ss
				return
			}
		}
	}
}

// SnapshotRecords returns a copy of Apply records.
func (f *Fake) SnapshotRecords() []ApplyRecord {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]ApplyRecord, len(f.Records))
	copy(out, f.Records)
	return out
}

func cloneState(s cluster.State) cluster.State {
	out := cluster.State{}
	if s.Services == nil {
		return out
	}
	out.Services = make(map[cluster.Service]cluster.ServiceState, len(s.Services))
	for k, v := range s.Services {
		v2 := v
		if v.Backends != nil {
			v2.Backends = append([]cluster.BackendState(nil), v.Backends...)
		}
		if v.QueuePending != nil {
			v2.QueuePending = make(map[string]int, len(v.QueuePending))
			for qk, qv := range v.QueuePending {
				v2.QueuePending[qk] = qv
			}
		}
		if v.QueueScaleUpPct != nil {
			v2.QueueScaleUpPct = make(map[string]float64, len(v.QueueScaleUpPct))
			for qk, qv := range v.QueueScaleUpPct {
				v2.QueueScaleUpPct[qk] = qv
			}
		}
		out.Services[k] = v2
	}
	return out
}
