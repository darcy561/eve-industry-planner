package docker

import (
	containertypes "github.com/moby/moby/api/types/container"
)

// TaskHealth is a container healthcheck status from Engine inspect.
type TaskHealth = containertypes.HealthStatus

const (
	TaskHealthNone      TaskHealth = containertypes.NoHealthcheck
	TaskHealthStarting  TaskHealth = containertypes.Starting
	TaskHealthHealthy   TaskHealth = containertypes.Healthy
	TaskHealthUnhealthy TaskHealth = containertypes.Unhealthy
)

// ServiceScore is one Swarm service's contribution to the Health rollup.
// Desired == 0 means the service is ignored (scaled to zero / not on).
type ServiceScore struct {
	Desired          uint64
	Running          uint64
	HasFailedDesired bool // desired-running task in failed/rejected
	TaskHealths      []TaskHealth
}

// RollupHealth computes worst-wins health across scored services.
// No scored services (empty stack / all desired=0) → red.
func RollupHealth(services []ServiceScore) HealthLight {
	scored := 0
	worst := HealthGreen
	for _, s := range services {
		if s.Desired == 0 {
			continue
		}
		scored++
		worst = worseHealth(worst, scoreService(s))
	}
	if scored == 0 {
		return HealthRed
	}
	return worst
}

func scoreService(s ServiceScore) HealthLight {
	if s.Running < s.Desired {
		if s.Running == 0 {
			return HealthRed
		}
		return HealthAmber
	}
	if s.HasFailedDesired {
		return HealthRed
	}

	hasAny := false
	hasUnhealthy := false
	hasStarting := false
	for _, h := range s.TaskHealths {
		switch h {
		case "", TaskHealthNone:
			continue
		case TaskHealthUnhealthy:
			hasAny = true
			hasUnhealthy = true
		case TaskHealthStarting:
			hasAny = true
			hasStarting = true
		default:
			hasAny = true
		}
	}
	if !hasAny {
		return HealthGreen
	}
	if hasUnhealthy {
		return HealthRed
	}
	if hasStarting {
		return HealthAmber
	}
	return HealthGreen
}

func worseHealth(a, b HealthLight) HealthLight {
	rank := func(h HealthLight) int {
		switch h {
		case HealthRed:
			return 3
		case HealthAmber:
			return 2
		case HealthGreen:
			return 1
		default:
			return 0
		}
	}
	if rank(b) > rank(a) {
		return b
	}
	return a
}
