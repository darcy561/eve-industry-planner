package subscriptionlogic

import "time"

// DiffSubscriptionSets returns doc IDs to remove from the old set and to add from the new set.
func DiffSubscriptionSets(old, newSet map[string]bool) (remove, add []string) {
	for id := range old {
		if !newSet[id] {
			remove = append(remove, id)
		}
	}
	for id := range newSet {
		if !old[id] {
			add = append(add, id)
		}
	}
	return remove, add
}

// RebuildClientActiveSubscriptions mirrors sync replace: active subs become exactly newSet keys,
// each stamped with now. Returns nil when newSet is empty.
func RebuildClientActiveSubscriptions(newSet map[string]bool, now time.Time) map[string]time.Time {
	if len(newSet) == 0 {
		return nil
	}
	out := make(map[string]time.Time, len(newSet))
	for docID := range newSet {
		out[docID] = now
	}
	return out
}
