// Package policy decides cluster shape. Pure Evaluate — no Moby / NATS side effects.
package policy

import (
	"eve-industry-planner/shared/queuescale"
	"fmt"
	"strings"
	"time"

	"eve-industry-planner/capacity-controller/cluster"
	"eve-industry-planner/capacity-controller/config"
)

// Action kinds emitted by Evaluate.
const (
	KindScale  = "scale"
	KindCordon = "cordon"
	KindDrain  = "drain"
	KindWait   = "wait"
)

// Action is one desired mutation (or wait hint).
type Action struct {
	Service     cluster.Service
	Kind        string
	Desired     *int
	ContainerID string
	Reason      string
}

// Plan is the side-effect-free result of Evaluate.
type Plan struct {
	Actions     []Action
	WaitAtLeast time.Duration
	Summary     string
}

// EvaluateService returns the next plan for one managed service.
// Cooldown is checked only against that service's ServiceState.Cooldown.
func EvaluateService(svc cluster.Service, state cluster.State, cfg config.Config, now time.Time) Plan {
	ss, ok := state.Services[svc]
	if !ok {
		return Plan{Summary: "hold"}
	}
	if inCooldown(ss.Cooldown, cfg.ScaleTiming.Cooldown.Duration(), now) {
		remaining := cfg.ScaleTiming.Cooldown.Duration() - now.Sub(ss.Cooldown.LastApplyAt)
		return Plan{Summary: "cooldown", WaitAtLeast: remaining}
	}

	var plan Plan
	switch svc {
	case cluster.ServiceWorker:
		if a, w, summary := evaluateWorker(ss, cfg.ScaleTiming, now); a != nil {
			plan.Actions = append(plan.Actions, *a)
			plan.Summary = summary
			plan.WaitAtLeast = w
		} else {
			plan.Summary = summary
			plan.WaitAtLeast = w
		}
	case cluster.ServiceWebsocket:
		if a, w, summary := evaluateWebsocket(ss, cfg.ScaleTiming, now); a != nil {
			plan.Actions = append(plan.Actions, *a)
			plan.Summary = summary
			plan.WaitAtLeast = w
		} else {
			plan.Summary = summary
			plan.WaitAtLeast = w
		}
	case cluster.ServiceAPI:
		ws, hasWS := state.Services[cluster.ServiceWebsocket]
		if !hasWS {
			plan.Summary = "hold"
			break
		}
		if a, w, summary := evaluateAPI(ss, ws, cfg.ScaleTiming, now); a != nil {
			plan.Actions = append(plan.Actions, *a)
			plan.Summary = summary
			plan.WaitAtLeast = w
		} else {
			plan.Summary = summary
			plan.WaitAtLeast = w
		}
	default:
		plan.Summary = "hold"
	}
	if plan.Summary == "" {
		plan.Summary = "hold"
	}
	return plan
}

// Evaluate merges per-service plans for ctl plan (no global cooldown gate).
func Evaluate(state cluster.State, cfg config.Config, now time.Time) Plan {
	var plan Plan
	wait := time.Duration(0)
	var summaries []string
	for _, svc := range cluster.ManagedServices {
		p := EvaluateService(svc, state, cfg, now)
		plan.Actions = append(plan.Actions, p.Actions...)
		if p.WaitAtLeast > wait {
			wait = p.WaitAtLeast
		}
		if p.Summary != "" && p.Summary != "hold" {
			summaries = append(summaries, string(svc)+":"+p.Summary)
		}
	}
	if len(summaries) == 0 {
		plan.Summary = "hold"
	} else {
		plan.Summary = strings.Join(summaries, "; ")
	}
	plan.WaitAtLeast = wait
	return plan
}

func inCooldown(cd cluster.CooldownState, cooldown time.Duration, now time.Time) bool {
	if cd.LastApplyAt.IsZero() || cooldown <= 0 {
		return false
	}
	return now.Sub(cd.LastApplyAt) < cooldown
}

func evaluateWorker(ss cluster.ServiceState, timing config.ScaleTiming, now time.Time) (*Action, time.Duration, string) {
	if !ss.Managed {
		return nil, 0, "hold"
	}
	if !ss.QueueDepthKnown {
		return nil, 0, "missing queue depth"
	}

	d, r, c := ss.DesiredReplicas, ss.Running, ss.Concurrency
	if c <= 0 {
		c = 1
	}
	if r <= 0 {
		r = d
		if r <= 0 {
			r = 1
		}
	}

	pct := ss.QueueScaleUpPct
	if len(pct) == 0 {
		pct = queuescale.DefaultQueueScaleUpPendingPct
	}
	slots := c * r
	upPressure := queuescale.ScaleUpPressure(ss.QueuePending, slots, pct)
	downPressure := ss.QueueDepth == 0 && ss.DesiredReplicas > ss.Min &&
		(r <= 1 || ss.ActiveTasks <= c*(r-1))

	upStab := timing.ScaleUpStabilization.Duration()
	downStab := timing.ScaleDownStabilization.Duration()

	if upPressure && d < ss.Max {
		if sustained(ss.PressureUpSince, upStab, now) {
			next := d + 1
			return scaleAction(cluster.ServiceWorker, next, "worker queue pending pressure"), 0, fmt.Sprintf("scale worker %d→%d", d, next)
		}
		return nil, remainingStab(ss.PressureUpSince, upStab, now), "worker scale-up stabilizing"
	}

	if downPressure && d > ss.Min {
		if sustained(ss.PressureDownSince, downStab, now) {
			next := d - 1
			return scaleAction(cluster.ServiceWorker, next, "worker idle"), 0, fmt.Sprintf("scale worker %d→%d", d, next)
		}
		return nil, remainingStab(ss.PressureDownSince, downStab, now), "worker scale-down stabilizing"
	}

	return nil, 0, "hold"
}

func evaluateWebsocket(ss cluster.ServiceState, timing config.ScaleTiming, now time.Time) (*Action, time.Duration, string) {
	d := ss.DesiredReplicas
	if d <= 0 {
		d = ss.Running
	}
	n := len(ss.Backends)
	if n == 0 {
		n = ss.Running
	}
	if n == 0 {
		return nil, 0, "hold"
	}

	totalClients := 0
	drainingEmpty := false
	for _, b := range ss.Backends {
		totalClients += b.Clients
		if b.Draining && b.Clients == 0 {
			drainingEmpty = true
		}
	}
	avg := float64(totalClients) / float64(n)
	target := ss.TargetClients
	if target <= 0 {
		target = 1
	}
	reserve := ss.ReserveCapacity
	if reserve < 0 {
		reserve = 0
	}
	if reserve >= 1 {
		reserve = 0.99
	}
	threshold := float64(target) * (1 - reserve)

	upStab := timing.ScaleUpStabilization.Duration()
	downStab := timing.ScaleDownStabilization.Duration()

	// Emit plans even when !Managed; Apply enforces Managed before mutating.
	if avg > threshold && d < ss.Max {
		if sustained(ss.PressureUpSince, upStab, now) {
			next := d + 1
			return scaleAction(cluster.ServiceWebsocket, next, "websocket reserve headroom"), 0, fmt.Sprintf("scale websocket %d→%d", d, next)
		}
		return nil, remainingStab(ss.PressureUpSince, upStab, now), "websocket scale-up stabilizing"
	}

	// Scale-in playbook: prefer scale when draining+empty; else drain (kick); else cordon victim.
	underutilised := avg <= float64(target)*0.35
	if d > ss.Min && underutilised {
		if drainingEmpty {
			if sustained(ss.PressureDownSince, downStab, now) {
				next := d - 1
				return scaleAction(cluster.ServiceWebsocket, next, "websocket draining empty"), 0, fmt.Sprintf("scale websocket %d→%d", d, next)
			}
			return nil, remainingStab(ss.PressureDownSince, downStab, now), "websocket scale-down stabilizing"
		}
		if victim := pickDrainVictim(ss.Backends); victim != "" {
			if sustained(ss.PressureDownSince, downStab, now) {
				return &Action{Service: cluster.ServiceWebsocket, Kind: KindDrain, ContainerID: victim, Reason: "websocket planned drain"}, 0, "drain " + victim
			}
			return nil, remainingStab(ss.PressureDownSince, downStab, now), "websocket drain stabilizing"
		}
		if victim := pickCordonVictim(ss.Backends); victim != "" {
			if sustained(ss.PressureDownSince, downStab, now) {
				return &Action{Service: cluster.ServiceWebsocket, Kind: KindCordon, ContainerID: victim, Reason: "websocket planned cordon"}, 0, "cordon " + victim
			}
			return nil, remainingStab(ss.PressureDownSince, downStab, now), "websocket cordon stabilizing"
		}
	}

	return nil, 0, "hold"
}

// evaluateAPI scales api replicas from websocket client load (same reserve /
// underutilised thresholds as websocket). Approximation until api has its own
// request signal. Plain Scale only — no cordon/drain.
func evaluateAPI(api, ws cluster.ServiceState, timing config.ScaleTiming, now time.Time) (*Action, time.Duration, string) {
	if !api.Managed {
		return nil, 0, "hold"
	}

	n := len(ws.Backends)
	if n == 0 {
		n = ws.Running
	}
	if n == 0 {
		return nil, 0, "hold"
	}
	totalClients := 0
	for _, b := range ws.Backends {
		totalClients += b.Clients
	}
	avg := float64(totalClients) / float64(n)

	target := ws.TargetClients
	if target <= 0 {
		return nil, 0, "hold"
	}
	reserve := ws.ReserveCapacity
	if reserve < 0 {
		reserve = 0
	}
	if reserve >= 1 {
		reserve = 0.99
	}
	threshold := float64(target) * (1 - reserve)

	d := api.DesiredReplicas
	if d <= 0 {
		d = api.Running
	}

	upStab := timing.ScaleUpStabilization.Duration()
	downStab := timing.ScaleDownStabilization.Duration()

	if avg > threshold && d < api.Max {
		if sustained(api.PressureUpSince, upStab, now) {
			next := d + 1
			return scaleAction(cluster.ServiceAPI, next, "api linked to websocket client load"), 0, fmt.Sprintf("scale api %d→%d", d, next)
		}
		return nil, remainingStab(api.PressureUpSince, upStab, now), "api scale-up stabilizing"
	}

	underutilised := avg <= float64(target)*0.35
	if d > api.Min && underutilised {
		if sustained(api.PressureDownSince, downStab, now) {
			next := d - 1
			return scaleAction(cluster.ServiceAPI, next, "api linked to websocket underutilised"), 0, fmt.Sprintf("scale api %d→%d", d, next)
		}
		return nil, remainingStab(api.PressureDownSince, downStab, now), "api scale-down stabilizing"
	}

	return nil, 0, "hold"
}

// pickDrainVictim returns a draining backend that still has clients.
func pickDrainVictim(backends []cluster.BackendState) string {
	for _, b := range backends {
		if b.Draining && b.Clients > 0 && b.ContainerID != "" {
			return b.ContainerID
		}
	}
	return ""
}

// pickCordonVictim chooses who to soft-stop: lowest clients, else last (newest-ish).
func pickCordonVictim(backends []cluster.BackendState) string {
	if len(backends) == 0 {
		return ""
	}
	best := -1
	for i, b := range backends {
		if b.ContainerID == "" || b.Draining {
			continue
		}
		if best < 0 || b.Clients < backends[best].Clients {
			best = i
		}
	}
	if best >= 0 {
		return backends[best].ContainerID
	}
	for i := len(backends) - 1; i >= 0; i-- {
		if backends[i].ContainerID != "" {
			return backends[i].ContainerID
		}
	}
	return ""
}

func sustained(since time.Time, need time.Duration, now time.Time) bool {
	if need <= 0 {
		return true
	}
	if since.IsZero() {
		return false
	}
	return !now.Before(since.Add(need))
}

func remainingStab(since time.Time, need time.Duration, now time.Time) time.Duration {
	if need <= 0 || since.IsZero() {
		return need
	}
	left := since.Add(need).Sub(now)
	if left < 0 {
		return 0
	}
	return left
}

func scaleAction(svc cluster.Service, desired int, reason string) *Action {
	d := desired
	return &Action{Service: svc, Kind: KindScale, Desired: &d, Reason: reason}
}
