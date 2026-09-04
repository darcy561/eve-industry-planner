package esiclient

import "testing"

// waiting is keyed by class, so counting the map counts classes rather than
// callers — at most two however many are parked. This holds the sum.
func TestQueueDepthCountsCallersNotClasses(t *testing.T) {
	d := &Dispatcher{
		queues: map[string]*bucketQueue{},
		seen:   map[string]Bucket{},
	}
	bucket := Bucket{Group: "market-order", User: AnonymousUser}
	q := &bucketQueue{waiting: map[Class][]*waiter{}}

	q.waiting[ClassBackground] = []*waiter{{}, {}, {}}
	q.waiting[ClassUserRequested] = []*waiter{{}, {}}
	q.held = []Reservation{{}, {}}

	d.queues[bucket.Key()] = q
	d.seen[bucket.Key()] = bucket

	depth, ok := d.queueDepth()[bucket]
	if !ok {
		t.Fatalf("no depth reported for %s", bucket.Key())
	}
	if depth.Waiting != 5 {
		t.Errorf("Waiting = %d, want the 5 parked callers rather than the 2 classes", depth.Waiting)
	}
	if depth.Held != 2 {
		t.Errorf("Held = %d, want 2", depth.Held)
	}
}
