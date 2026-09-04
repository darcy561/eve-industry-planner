// Package queuescale holds the worker's queue set and the thresholds at which
// pending work on those queues becomes pressure to add replicas.
//
// It is shared because both sides of that decision need the same figures: the
// worker runs the queues and the capacity controller reads their depth, and
// neither service may import the other.
//
// It does not hold how often the server polls each queue. Those weights are the
// worker's own and live with its server config.
package queuescale

import (
	"maps"

	eipnats "eve-industry-planner/shared/nats"
)

// DefaultQueueScaleUpPendingPct is how much pending work on a queue, as a
// fraction of worker slots (concurrency×running), counts as pressure to scale up.
//
// A lower fraction means less patience: priority_1 pushes for another replica at
// a tenth of capacity, priority_5 not until it is twice over.
var DefaultQueueScaleUpPendingPct = map[string]float64{
	eipnats.Priority1: 0.10,
	eipnats.Priority2: 0.25,
	eipnats.Priority3: 0.50,
	eipnats.Priority4: 1.0,
	eipnats.Priority5: 2.0,
}

// PriorityQueueNames is the worker queue set, highest priority first.
var PriorityQueueNames = []string{eipnats.Priority1, eipnats.Priority2, eipnats.Priority3, eipnats.Priority4, eipnats.Priority5}

// MergeQueueScaleUpPendingPct copies defaults, then overlays operator values.
func MergeQueueScaleUpPendingPct(override map[string]float64) map[string]float64 {
	out := make(map[string]float64, len(DefaultQueueScaleUpPendingPct))
	maps.Copy(out, DefaultQueueScaleUpPendingPct)
	maps.Copy(out, override)
	return out
}

// ScaleUpPressure reports whether any queue's pending exceeds slots×pct[queue].
// slots is concurrency×running. Queues missing from pct are ignored.
func ScaleUpPressure(pendingByQueue map[string]int, slots int, pct map[string]float64) bool {
	if slots <= 0 || len(pct) == 0 {
		return false
	}
	for _, q := range PriorityQueueNames {
		frac, ok := pct[q]
		if !ok {
			continue
		}
		p := 0
		if pendingByQueue != nil {
			p = pendingByQueue[q]
		}
		if frac <= 0 {
			if p > 0 {
				return true
			}
			continue
		}
		if float64(p) > float64(slots)*frac {
			return true
		}
	}
	return false
}
