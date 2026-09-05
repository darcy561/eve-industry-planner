package archivedjobs

import (
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
)

func queued(work eipmongo.StatsWork, age time.Duration, now time.Time) eipmongo.QueuedOwner {
	return eipmongo.QueuedOwner{
		Owner:    models.AccountOwner("acct"),
		Work:     work,
		QueuedAt: now.Add(-age),
	}
}

// The debounce bounds how often an owner is rebuilt while the system serves
// traffic. An operator running the drain by hand is waiting on the queue, so it
// does not apply to them — this is what made a manual drain look like a stall.
func TestOperatorDrainIgnoresTheDebounce(t *testing.T) {
	t.Parallel()
	now := time.Now().UTC()
	fresh := queued(eipmongo.StatsWorkRebuild, time.Second, now)

	if dispatchable(fresh, now, false) {
		t.Fatal("a freshly queued rebuild should wait out the debounce on a scheduled pass")
	}
	if !dispatchable(fresh, now, true) {
		t.Fatal("a hand-run drain should dispatch it at once")
	}
}

func TestRebuildGoesOnceTheDebounceHasPassed(t *testing.T) {
	t.Parallel()
	now := time.Now().UTC()
	if !dispatchable(queued(eipmongo.StatsWorkRebuild, rebuildDebounce+time.Second, now), now, false) {
		t.Fatal("a rebuild past the debounce should dispatch")
	}
}

// A delta is what a user is waiting on, so it is never held back.
func TestDeltaIsNeverDebounced(t *testing.T) {
	t.Parallel()
	now := time.Now().UTC()
	if !dispatchable(queued(eipmongo.StatsWorkDelta, time.Second, now), now, false) {
		t.Fatal("a delta should dispatch immediately")
	}
}
