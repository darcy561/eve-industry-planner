package tasks

// DefaultQueueScaleUpPendingPct is the fraction of worker slots (concurrency×running)
// of pending work on that queue that triggers capacity scale-up pressure.
// Separate from Asynq poll weights in the worker server config.
var DefaultQueueScaleUpPendingPct = map[string]float64{
	Priority1: 0.10,
	Priority2: 0.25,
	Priority3: 0.50,
	Priority4: 1.0,
	Priority5: 2.0,
}

// PriorityQueueNames is the ordered worker queue set.
var PriorityQueueNames = []string{Priority1, Priority2, Priority3, Priority4, Priority5}

// MergeQueueScaleUpPendingPct copies defaults, then overlays operator values.
func MergeQueueScaleUpPendingPct(override map[string]float64) map[string]float64 {
	out := make(map[string]float64, len(DefaultQueueScaleUpPendingPct))
	for k, v := range DefaultQueueScaleUpPendingPct {
		out[k] = v
	}
	for k, v := range override {
		out[k] = v
	}
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
