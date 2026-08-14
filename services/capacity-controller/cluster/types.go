// Package cluster is the Observe/Apply seam for the capacity controller.
// Policy stays free of Moby types; Swarm mutations live behind Cluster implementations.
package cluster

import (
	"context"
	"time"
)

// Service is an elastic Swarm service family the controller may manage
// (matches operator YAML services.* keys).
type Service string

const (
	ServiceWorker    Service = "worker"
	ServiceWebsocket Service = "websocket"
	ServiceAPI       Service = "api"
)

// ManagedServices is the fixed set of elastic families v1 evaluates.
var ManagedServices = []Service{ServiceWorker, ServiceWebsocket, ServiceAPI}

// Cluster observes desired shape and applies mutations (Moby / NATS behind the impl).
type Cluster interface {
	Observe(ctx context.Context) (State, error)
	Scale(ctx context.Context, svc Service, desired int) error
	Cordon(ctx context.Context, containerID string) error
	Drain(ctx context.Context, containerID string) error
	Uncordon(ctx context.Context, containerID string) error
}

// State is a point-in-time observation for policy.Evaluate.
type State struct {
	Services map[Service]ServiceState
}

// CooldownState is hysteresis after Apply for one service (persisted by Observe).
type CooldownState struct {
	LastApplyAt time.Time // zero = never applied
}

// ServiceState is per-service observation + YAML-derived clamps (merged by Observe).
type ServiceState struct {
	DesiredReplicas int
	Running         int
	Backends        []BackendState
	QueueDepth      int            // worker: sum of Asynq pending (scale-down)
	QueuePending    map[string]int // worker: pending by queue name
	QueueDepthKnown bool           // false → Evaluate holds worker scale
	ActiveTasks     int            // worker: Asynq active
	Concurrency     int
	Managed         bool
	Min, Max        int
	// Worker scale-up thresholds (merged YAML + defaults), fraction of concurrency×running:
	QueueScaleUpPct map[string]float64
	// Websocket policy inputs (from YAML snapshot on Observe):
	TargetClients   int
	ReserveCapacity float64
	Cooldown        CooldownState
	// Stabilization: when current up/down pressure first became true (zero = not under that pressure).
	PressureUpSince   time.Time
	PressureDownSince time.Time
}

// BackendState is one live websocket (or similar) task.
type BackendState struct {
	ContainerID       string
	Clients           int
	Soft, Full        bool
	Draining          bool
	Healthy, Ready    bool
	HostedTenantCount int
}
