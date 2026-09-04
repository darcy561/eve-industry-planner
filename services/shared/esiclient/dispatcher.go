package esiclient

import (
	"context"
	"fmt"
	"maps"
	"sync"
	"time"

	"eve-industry-planner/shared/httpclient"
)

// Dispatcher decides who calls ESI and when. It implements httpclient.Gate, so
// the HTTP client asks it to admit every attempt — retries included — and tells
// it what each one cost.
//
// Slots come from the shared clock in Redis, so replicas order themselves
// against one another. Waiting happens here, in process, because a caller
// parked on a channel is cheaper than a task requeued: a requeue replays the
// work already done and spends budget on it.
type Dispatcher struct {
	store *Store
	cfg   Config

	mu     sync.Mutex
	queues map[string]*bucketQueue
	// seen is every real bucket this dispatcher has touched. A bucket holds
	// budget whether or not anyone is queued for it, so reporting follows this
	// rather than the queues, which come and go with demand.
	seen    map[string]Bucket
	closed  bool
	stopped chan struct{}
	wg      sync.WaitGroup
}

// NewDispatcher returns a dispatcher and the function that stops it. Every
// pump goroutine it starts is owned by that stop.
func NewDispatcher(store *Store, cfg Config) (*Dispatcher, func()) {
	d := &Dispatcher{
		store:   store,
		cfg:     cfg,
		queues:  map[string]*bucketQueue{},
		seen:    map[string]Bucket{},
		stopped: make(chan struct{}),
	}
	return d, d.close
}

func (d *Dispatcher) close() {
	d.mu.Lock()
	if d.closed {
		d.mu.Unlock()
		return
	}
	d.closed = true
	close(d.stopped)
	queues := make([]*bucketQueue, 0, len(d.queues))
	for _, q := range d.queues {
		queues = append(queues, q)
	}
	d.mu.Unlock()

	for _, q := range queues {
		q.releaseHeld(context.Background())
	}
	d.wg.Wait()
}

// Admit blocks until this call has a slot, or returns a RateLimitError saying
// when to come back. It is the Gate half the HTTP client calls.
func (d *Dispatcher) Admit(ctx context.Context, req *httpclient.Request) (httpclient.Ticket, error) {
	call, ok := callFrom(ctx)
	if !ok {
		return nil, fmt.Errorf("esiclient: request reached the gate without a resolved call")
	}
	reservation, err := d.acquire(ctx, call)
	if err != nil {
		return nil, err
	}
	return reservation, nil
}

// Settle reconciles the ledger with what the attempt actually cost.
func (d *Dispatcher) Settle(ctx context.Context, ticket httpclient.Ticket, resp *httpclient.Response, err error) {
	reservation, ok := ticket.(Reservation)
	if !ok {
		return
	}

	// Settling must outlive a cancelled request: the tokens were spent whatever
	// happened to the caller.
	settleCtx := context.WithoutCancel(ctx)
	if resp == nil {
		// No response came back. If the attempt reached the network that is
		// evidence about availability; if it never left, it is not.
		if err != nil {
			_ = d.store.SettleUnreachable(settleCtx, reservation)
		} else {
			_ = d.store.Release(settleCtx, reservation)
		}
		return
	}

	// The bucket was a guess until this response named the group. Settle what it
	// actually cost against the real bucket, or the allowance is learned onto a
	// placeholder and the next call rediscovers it — concurrently, this time.
	if disclosed := disclosedBucket(resp, reservation.Bucket); disclosed != reservation.Bucket {
		_ = d.store.Release(settleCtx, reservation)
		d.retire(reservation.Bucket)
		reservation.Bucket = disclosed
	}
	d.note(reservation.Bucket)

	outcome := outcomeFrom(resp)
	if outcome.RetryAfter > 0 {
		recordGateClosure(settleCtx, reservation.Bucket)
		if gate := d.queueFor(reservation.Bucket); gate != nil {
			gate.gateChanged()
		}
	}
	recordRequest(settleCtx, reservation.Bucket, reservation.Class,
		resp.Status, outcome.Cost, resp.Wire, resp.Duration)

	_ = d.store.Settle(settleCtx, reservation, outcome)
}

func (d *Dispatcher) acquire(ctx context.Context, call call) (Reservation, error) {
	queue, err := d.queue(call.bucket)
	if err != nil {
		return Reservation{}, err
	}
	return queue.acquire(ctx, call)
}

func (d *Dispatcher) queue(b Bucket) (*bucketQueue, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.closed {
		return nil, fmt.Errorf("esiclient: dispatcher stopped")
	}
	if q, ok := d.queues[b.Key()]; ok {
		return q, nil
	}

	q := newBucketQueue(d, b)
	d.queues[b.Key()] = q
	if !b.Placeholder() {
		d.seen[b.Key()] = b
	}
	d.wg.Go(func() {
		q.pump()
	})
	return q, nil
}

func (d *Dispatcher) queueFor(b Bucket) *bucketQueue {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.queues[b.Key()]
}

// retire drops the queue for a bucket that turned out not to exist — the
// placeholder a first call guesses before the group is known. Left in place it
// would report itself forever, and its name is per path, so it would grow a
// metric series for every endpoint.
// note records a real bucket so it is reported even before anyone queues for it.
func (d *Dispatcher) note(b Bucket) {
	if b.Placeholder() {
		return
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	d.seen[b.Key()] = b
}

func (d *Dispatcher) retire(b Bucket) {
	if !b.Placeholder() {
		return
	}
	d.mu.Lock()
	q, ok := d.queues[b.Key()]
	if ok {
		delete(d.queues, b.Key())
	}
	d.mu.Unlock()
	if ok {
		q.releaseHeld(context.Background())
	}
}

// waiter is one caller parked on a slot.
type waiter struct {
	call     call
	arrived  time.Time
	deadline time.Time
	granted  chan Reservation
	refused  chan *RateLimitError
}

// bucketQueue holds the waiters for one bucket and the slots reserved for them.
// One pump goroutine owns the reservations, so a slot is only ever handed to a
// caller that is still present.
type bucketQueue struct {
	d      *Dispatcher
	bucket Bucket

	mu sync.Mutex
	// waiting is one queue per class rather than a single ordered heap. Strict
	// class order starves the lower classes outright: a class whose callers
	// re-queue the moment they are served is always at the head, so nothing
	// below it is ever reached. Selection happens at hand-off instead, against
	// the same floors that govern the budget.
	waiting map[Class][]*waiter
	waiters int
	// handedOut counts recent hand-offs per class, which is what a class's share
	// is measured against.
	handedOut map[Class]int
	held      []Reservation
	demand    chan struct{}
	gate      chan struct{}
}

func newBucketQueue(d *Dispatcher, b Bucket) *bucketQueue {
	return &bucketQueue{
		d:         d,
		bucket:    b,
		waiting:   map[Class][]*waiter{},
		handedOut: map[Class]int{},
		demand:    make(chan struct{}, 1),
		gate:      make(chan struct{}),
	}
}

// gateChanged wakes every parked waiter, so a 429 arriving mid-wait is not sat
// through by callers whose slot is now worthless.
func (q *bucketQueue) gateChanged() {
	q.mu.Lock()
	defer q.mu.Unlock()
	close(q.gate)
	q.gate = make(chan struct{})
}

func (q *bucketQueue) acquire(ctx context.Context, c call) (Reservation, error) {
	tolerance := q.d.tolerance(c)

	q.mu.Lock()
	if q.waiters >= q.d.cfg.WaiterCap && !q.underShareLocked(c.class) {
		queued := q.waiters
		q.mu.Unlock()
		recordYield(ctx, q.bucket, c.class, KindQueued)
		return Reservation{}, &RateLimitError{
			Kind:       KindQueued,
			RetryAfter: time.Now().Add(q.drainEstimate(c, queued)),
			Bucket:     q.bucket,
			Reason:     fmt.Sprintf("%d callers already waiting on this bucket", q.d.cfg.WaiterCap),
		}
	}

	w := &waiter{
		call:     c,
		arrived:  time.Now(),
		deadline: time.Now().Add(tolerance),
		granted:  make(chan Reservation, 1),
		refused:  make(chan *RateLimitError, 1),
	}
	q.waiting[c.class] = append(q.waiting[c.class], w)
	q.waiters++
	gate := q.gate
	q.mu.Unlock()

	q.nudge()

	timer := time.NewTimer(tolerance)
	defer timer.Stop()

	// A class short of its floor keeps its place instead of yielding, up to
	// FloorWait. Its own context still ends the wait, so a task with no time
	// left is not held here.
	floorStop := time.Now().Add(q.d.cfg.FloorWait)

	for {
		select {
		case reservation := <-w.granted:
			recordWait(ctx, q.bucket, c.class, time.Since(w.arrived))
			if reservation.Probe {
				recordProbe(ctx, q.bucket)
			}
			return reservation, nil
		case refusal := <-w.refused:
			q.remove(w)
			recordYield(ctx, q.bucket, c.class, refusal.Kind)
			return Reservation{}, refusal
		case <-gate:
			q.remove(w)
			recordYield(ctx, q.bucket, c.class, KindGated)
			return Reservation{}, q.gateRefusal(ctx)
		case <-timer.C:
			// The pump may have handed a slot over as the timer fired; take it
			// rather than let a reserved slot go unused.
			select {
			case reservation := <-w.granted:
				recordWait(ctx, q.bucket, c.class, time.Since(w.arrived))
				return reservation, nil
			default:
			}
			if q.owedAPlace(c.class) && time.Now().Before(floorStop) {
				q.extend(w, tolerance)
				timer.Reset(tolerance)
				continue
			}

			q.remove(w)
			recordYield(ctx, q.bucket, c.class, KindQueued)
			return Reservation{}, &RateLimitError{
				Kind:       KindQueued,
				RetryAfter: time.Now().Add(q.drainEstimate(c, q.depth())),
				Bucket:     q.bucket,
				Reason:     fmt.Sprintf("no slot within %s", time.Since(w.arrived).Round(time.Millisecond)),
			}
		case <-ctx.Done():
			q.remove(w)
			select {
			case reservation := <-w.granted:
				recordWait(ctx, q.bucket, c.class, time.Since(w.arrived))
				return reservation, nil
			default:
			}
			return Reservation{}, ctx.Err()
		case <-q.d.stopped:
			q.remove(w)
			return Reservation{}, fmt.Errorf("esiclient: dispatcher stopped")
		}
	}
}

// owedAPlace reports whether a class is still short of its floor, and so should
// hold its place rather than give it up.
func (q *bucketQueue) owedAPlace(class Class) bool {
	q.mu.Lock()
	defer q.mu.Unlock()
	return q.d.cfg.belowFloor(class, q.handedOut)
}

// extend pushes back a waiter's deadline so a refusal sweep does not evict the
// caller the extension was granted to.
func (q *bucketQueue) extend(w *waiter, by time.Duration) {
	q.mu.Lock()
	defer q.mu.Unlock()
	w.deadline = time.Now().Add(by)
}

// underShareLocked reports whether a class holds less of the queue than its floor
// entitles it to.
//
// The cap has to know about class or it undoes the scheduling below it: a class
// with many callers keeps the queue full, and a class with few is turned away
// before it is ever queued, so the selection that would have favoured it never
// sees it. A class under its share is therefore admitted past the cap, which
// loosens the bound by at most one place per class.
func (q *bucketQueue) underShareLocked(class Class) bool {
	if q.waiters == 0 {
		return true
	}
	share := float64(len(q.waiting[class])) / float64(q.waiters)
	return share < q.d.cfg.floorShare(class)
}

// drainEstimate is when a caller turned away for queue depth should return: about
// as long as the queue takes to clear at burst pace.
//
// It must not be the caller's own tolerance. A class given generous patience
// would then serve a long penalty precisely for being patient, and the classes
// that wait longest would come back slowest.
func (q *bucketQueue) drainEstimate(c call, queued int) time.Duration {
	spacing := c.policy.MinSpacing
	if spacing <= 0 {
		spacing = 20 * time.Millisecond
	}
	return min(spacing*time.Duration(max(queued, 1)+1), time.Second)
}

func (q *bucketQueue) depth() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	return q.waiters
}

func (q *bucketQueue) gateRefusal(ctx context.Context) *RateLimitError {
	state, err := q.d.store.State(context.WithoutCancel(ctx), q.bucket)
	refusal := &RateLimitError{Kind: KindGated, Bucket: q.bucket, Reason: "bucket gated while waiting"}
	if err == nil && !state.GatedUntil.IsZero() {
		refusal.RetryAfter = state.GatedUntil
	} else {
		refusal.RetryAfter = time.Now().Add(time.Second)
	}
	return refusal
}

func (q *bucketQueue) remove(w *waiter) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.removeLocked(w)
}

func (q *bucketQueue) removeLocked(w *waiter) {
	queue := q.waiting[w.call.class]
	for i, candidate := range queue {
		if candidate != w {
			continue
		}
		q.waiting[w.call.class] = append(queue[:i], queue[i+1:]...)
		q.waiters--
		return
	}
}

func (q *bucketQueue) nudge() {
	select {
	case q.demand <- struct{}{}:
	default:
	}
}

// pump reserves slots while callers are waiting and hands each one to the
// highest-priority waiter still present when it matures.
func (q *bucketQueue) pump() {
	ctx := context.Background()
	for {
		select {
		case <-q.d.stopped:
			return
		case <-q.demand:
		}

		for q.hasWaiters() {
			if !q.ensureSlots(ctx) {
				break
			}
			if !q.handOut(ctx) {
				break
			}
		}
	}
}

func (q *bucketQueue) hasWaiters() bool {
	q.mu.Lock()
	defer q.mu.Unlock()
	return q.waiters > 0
}

// nextLocked picks the waiter to serve.
//
// A floor is a guarantee of a minimum, not a quota to be filled. So the choice
// is in two tiers: any class still short of its floor goes first, and among
// those the one furthest short by proportion of what it is owed; once every
// waiting class has its floor, rank decides and the class with a user waiting
// on it wins.
//
// Ranking purely by proportion — without the tier — hands the queue to whichever
// class has fewest callers, because a small class accumulates hand-offs slowly
// and so never stops looking owed. Measured, that gave one caller in eight 91%
// of the throughput.
func (q *bucketQueue) nextLocked() *waiter {
	var chosen Class
	var chosenSet, chosenOwed bool
	var bestRatio float64

	total := 0
	for _, count := range q.handedOut {
		total += count
	}

	for class, queue := range q.waiting {
		if len(queue) == 0 {
			continue
		}
		share := 0.0
		if total > 0 {
			share = float64(q.handedOut[class]) / float64(total)
		}

		// A class with no floor is still owed something, or it would only run
		// when nothing else is waiting.
		target := max(q.d.cfg.floorShare(class), 0.01)
		ratio := share / target
		owed := ratio < 1

		switch {
		case !chosenSet:
		case owed && !chosenOwed:
		case owed == chosenOwed && owed && ratio < bestRatio:
		case owed == chosenOwed && !owed && class > chosen:
		default:
			continue
		}
		chosen, bestRatio, chosenOwed, chosenSet = class, ratio, owed, true
	}
	if !chosenSet {
		return nil
	}

	queue := q.waiting[chosen]
	w := queue[0]
	q.waiting[chosen] = queue[1:]
	q.waiters--
	q.handedOut[chosen]++
	q.decayLocked(total + 1)
	return w
}

// decayLocked halves the hand-off tally periodically so the share reflects
// recent traffic rather than the whole life of the process.
func (q *bucketQueue) decayLocked(total int) {
	if total < 256 {
		return
	}
	for class, count := range q.handedOut {
		q.handedOut[class] = count / 2
	}
}

// ensureSlots tops up the held reservations, reporting whether any are
// available. Reserving only on demand means an idle replica holds no slots.
func (q *bucketQueue) ensureSlots(ctx context.Context) bool {
	q.mu.Lock()
	if len(q.held) > 0 {
		q.mu.Unlock()
		return true
	}
	next := q.peekLocked()
	q.mu.Unlock()
	if next == nil {
		return false
	}

	count := 1
	if q.d.cfg.Mode == ModeBlock {
		count = max(q.d.cfg.BlockSize, 1)
	}

	grant, err := q.d.store.Reserve(ctx, q.bucket, next.call.class, next.call.policy, count)
	if err != nil {
		q.refuseAll(&RateLimitError{
			Kind:       KindGated,
			RetryAfter: time.Now().Add(time.Second),
			Bucket:     q.bucket,
			Reason:     "reservation failed: " + err.Error(),
		})
		return false
	}
	if !grant.Granted {
		q.refuseBeyond(grant)
		return false
	}

	q.mu.Lock()
	q.held = append(q.held, grant.Reservations...)
	q.mu.Unlock()
	return true
}

// handOut waits for the next slot to mature and gives it to whoever is first in
// line. A slot nobody claims is returned rather than wasted.
func (q *bucketQueue) handOut(ctx context.Context) bool {
	q.mu.Lock()
	if len(q.held) == 0 {
		q.mu.Unlock()
		return false
	}
	slot := q.held[0]
	q.mu.Unlock()

	if wait := time.Until(slot.Slot); wait > 0 {
		timer := time.NewTimer(wait)
		select {
		case <-timer.C:
		case <-q.d.stopped:
			timer.Stop()
			return false
		}
		timer.Stop()
	}

	q.mu.Lock()
	q.held = q.held[1:]
	var taker *waiter
	for {
		candidate := q.nextLocked()
		if candidate == nil {
			break
		}
		select {
		case candidate.granted <- slot:
			taker = candidate
		default:
			continue
		}
		break
	}
	q.mu.Unlock()

	if taker == nil {
		_ = q.d.store.Release(ctx, slot)
		return false
	}
	return true
}

// refuseBeyond tells waiters that cannot outlast the refusal to go away, and
// leaves the rest parked for when the bucket recovers.
func (q *bucketQueue) refuseBeyond(grant Grant) {
	refusal := &RateLimitError{
		Kind:       grant.Kind,
		RetryAfter: grant.RetryAt,
		Bucket:     q.bucket,
		Reason:     refusalReason(grant.Kind),
	}
	if grant.Kind == KindDowntime {
		// Nothing will be served anywhere until Tranquility answers again, so
		// there is no point holding a queue for this bucket.
		q.refuseAll(refusal)
		time.AfterFunc(max(time.Until(grant.RetryAt), time.Second), q.nudge)
		return
	}

	q.mu.Lock()
	var refuse []*waiter
	kept := 0
	for class, queue := range q.waiting {
		keep := queue[:0]
		for _, w := range queue {
			if grant.RetryAt.After(w.deadline) {
				refuse = append(refuse, w)
				continue
			}
			keep = append(keep, w)
		}
		q.waiting[class] = keep
		kept += len(keep)
	}
	q.waiters = kept
	q.mu.Unlock()

	for _, w := range refuse {
		select {
		case w.refused <- refusal:
		default:
		}
	}

	// Come back when the bucket does, so a parked caller is not left indefinitely.
	if kept > 0 {
		time.AfterFunc(max(time.Until(grant.RetryAt), 10*time.Millisecond), q.nudge)
	}
}

func (q *bucketQueue) refuseAll(refusal *RateLimitError) {
	q.mu.Lock()
	var waiting []*waiter
	for class, queue := range q.waiting {
		waiting = append(waiting, queue...)
		q.waiting[class] = nil
	}
	q.waiters = 0
	q.mu.Unlock()

	for _, w := range waiting {
		select {
		case w.refused <- refusal:
		default:
		}
	}
}

// releaseHeld hands back slots nobody claimed, so a shutdown does not leave the
// fleet clock advanced past time that went unused.
func (q *bucketQueue) releaseHeld(ctx context.Context) {
	q.mu.Lock()
	held := q.held
	q.held = nil
	q.mu.Unlock()

	for _, reservation := range held {
		_ = q.d.store.Release(ctx, reservation)
	}
}

func refusalReason(kind Kind) string {
	switch kind {
	case KindDecelerating:
		return "bucket low; returning when charges expire rather than at the next slot"
	case KindGated:
		return "bucket gated"
	case KindErrorLimit:
		return "fleet error guard tripped"
	case KindDowntime:
		return "Tranquility is not answering; waiting for the next probe"
	case KindDiscovering:
		return "another caller is discovering this bucket's allowance"
	default:
		return "no slot available"
	}
}

func (d *Dispatcher) tolerance(c call) time.Duration {
	if c.policy.Tolerance > 0 {
		return c.policy.Tolerance
	}
	if t, ok := d.cfg.Tolerance[c.class]; ok && t > 0 {
		return t
	}
	return time.Second
}

// peekLocked returns any waiting caller, for deciding what to reserve against.
func (q *bucketQueue) peekLocked() *waiter {
	for class := ClassUserRequested; ; class-- {
		if queue := q.waiting[class]; len(queue) > 0 {
			return queue[0]
		}
		if class == ClassBackground {
			return nil
		}
	}
}

// QueueDepth is how much work one bucket's queue is holding here.
type QueueDepth struct {
	Waiting int
	Held    int
}

// queueDepth reports every queue this dispatcher holds. It touches no Redis, so
// the metrics callback costs nothing beyond a lock per bucket.
func (d *Dispatcher) queueDepth() map[Bucket]QueueDepth {
	d.mu.Lock()
	queues := make(map[string]*bucketQueue, len(d.queues))
	maps.Copy(queues, d.queues)
	seen := make(map[string]Bucket, len(d.seen))
	maps.Copy(seen, d.seen)
	d.mu.Unlock()

	out := make(map[Bucket]QueueDepth, len(queues))
	for key, q := range queues {
		bucket, ok := seen[key]
		if !ok {
			continue
		}
		q.mu.Lock()
		// waiting is keyed by class, so its length is the number of classes with
		// callers, not the number of callers.
		parked := 0
		for _, byClass := range q.waiting {
			parked += len(byClass)
		}
		out[bucket] = QueueDepth{Waiting: parked, Held: len(q.held)}
		q.mu.Unlock()
	}
	return out
}
