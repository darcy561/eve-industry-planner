package soaklib

import (
	"context"
	"fmt"
	"math/rand/v2"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const (
	defaultFanoutLiveRatio  = 0.65
	// Scheduler defaults keep harness CPU off the hot path; tests override with short ticks.
	defaultChurnTick         = 250 * time.Millisecond
	defaultChurnReplaceEvery = 2 * time.Second
	defaultChurnLeavePoll    = 50 * time.Millisecond
	defaultChurnLeaveTimeout = 30 * time.Second
	defaultChurnJoinBuf      = 64
	defaultChurnLeaveBuf     = 64
)

// ChurnPoolStats tracks inventory and join/leave progress.
type ChurnPoolStats struct {
	Inventory     atomic.Uint64
	Live          atomic.Int64
	Joins         atomic.Uint64
	Leaves        atomic.Uint64
	LeaveTimeouts atomic.Uint64
	JoinBlocked   atomic.Uint64
	LeaveBlocked  atomic.Uint64
}

func (s *ChurnPoolStats) summary() string {
	if s == nil {
		return "inventory=0 live=0 joins=0 leaves=0"
	}
	return fmt.Sprintf("inventory=%d live=%d joins=%d leaves=%d leave_timeout=%d",
		s.Inventory.Load(), s.Live.Load(), s.Joins.Load(), s.Leaves.Load(), s.LeaveTimeouts.Load())
}

// ChurnPoolOptions configures concurrent join/leave toward a live-ratio target.
type ChurnPoolOptions struct {
	// GenCh is optional; when set, the pool ingests TenantEvent clients into inventory.
	GenCh <-chan TenantEvent
	// Initial seeds inventory before the scheduler runs (e.g. after CollectTenantGen).
	Initial []clientIdentity

	LiveRatio float64 // 0 = default 0.65
	// LiveRatioFunc overrides LiveRatio each scheduler tick when set (tests / dynamic targets).
	LiveRatioFunc func() float64
	TickEvery     time.Duration // scheduler cadence
	ReplaceEvery  time.Duration // min gap between at-target leave/join swaps (0 = default)
	LeavePoll     time.Duration
	LeaveTimeout  time.Duration
	JoinBuf       int
	LeaveBuf      int
	Seed          int64 // RNG for join/leave picks; 0 = time-based

	// Pending is true while account still appears in an open delivery expect (leave must wait).
	// nil means leaves do not wait on pending.
	Pending func(accountID string) bool

	// RunIdentity holds one live client until ctx is cancelled. Required.
	// Affinity cookies are already on clientIdentity; dial paths must honor them.
	RunIdentity func(ctx context.Context, id clientIdentity)

	// OnLeaveTimeout is optional; called when leave wait expires after a force-leave
	// (LeaveTimeouts already incremented). Leave timeouts are never fatal to the pool.
	OnLeaveTimeout func(accountID string)
}

func (o ChurnPoolOptions) withDefaults() ChurnPoolOptions {
	out := o
	if out.LiveRatio <= 0 {
		out.LiveRatio = defaultFanoutLiveRatio
	}
	if out.LiveRatio > 1 {
		out.LiveRatio = 1
	}
	if out.TickEvery <= 0 {
		out.TickEvery = defaultChurnTick
	}
	if out.ReplaceEvery <= 0 {
		out.ReplaceEvery = defaultChurnReplaceEvery
	}
	if out.LeavePoll <= 0 {
		out.LeavePoll = defaultChurnLeavePoll
	}
	if out.LeaveTimeout <= 0 {
		out.LeaveTimeout = defaultChurnLeaveTimeout
	}
	if out.JoinBuf <= 0 {
		out.JoinBuf = defaultChurnJoinBuf
	}
	if out.LeaveBuf <= 0 {
		out.LeaveBuf = defaultChurnLeaveBuf
	}
	return out
}

type liveWorker struct {
	id     clientIdentity
	cancel context.CancelFunc
	done   chan struct{}
}

// churnPool maintains inventory and drives live membership toward LiveRatio.
type churnPool struct {
	opts    ChurnPoolOptions
	stats   *ChurnPoolStats
	rng     *rand.Rand
	joinCh  chan clientIdentity
	leaveCh chan string
	frozen  atomic.Bool

	mu          sync.Mutex
	inventory   map[string]clientIdentity
	live        map[string]*liveWorker
	joining     map[string]bool
	leaving     map[string]bool
	lastReplace time.Time
}

// StartChurnPool runs inventory ingest + join/leave schedulers until ctx is done.
// errCh receives at most one fatal error (e.g. RunIdentity misconfig). Leave timeouts
// force-disconnect and continue (counted in LeaveTimeouts) so large soaks are not aborted.
// freeze stops further join/leave scheduling while keeping live workers up (for delivery drain).
func StartChurnPool(ctx context.Context, opts ChurnPoolOptions) (stats *ChurnPoolStats, errCh <-chan error, freeze func()) {
	opts = opts.withDefaults()
	stats = &ChurnPoolStats{}
	ch := make(chan error, 1)
	errCh = ch

	if opts.RunIdentity == nil {
		ch <- fmt.Errorf("churnPool: RunIdentity is required")
		close(ch)
		return stats, errCh, func() {}
	}

	p := &churnPool{
		opts:      opts,
		stats:     stats,
		rng:       newTenantRNG(opts.Seed),
		joinCh:    make(chan clientIdentity, opts.JoinBuf),
		leaveCh:   make(chan string, opts.LeaveBuf),
		inventory: map[string]clientIdentity{},
		live:      map[string]*liveWorker{},
		joining:   map[string]bool{},
		leaving:   map[string]bool{},
	}
	for _, id := range opts.Initial {
		p.addInventory(id)
	}

	var wg sync.WaitGroup
	wg.Add(3)
	go func() {
		defer wg.Done()
		p.ingestLoop(ctx)
	}()
	go func() {
		defer wg.Done()
		p.joinLoop(ctx)
	}()
	go func() {
		defer wg.Done()
		p.leaveLoop(ctx, ch)
	}()

	go func() {
		p.schedulerLoop(ctx)
		// Stop workers on shutdown.
		p.cancelAllLive()
		wg.Wait()
		close(ch)
	}()

	freeze = func() { p.frozen.Store(true) }
	return stats, errCh, freeze
}

func (p *churnPool) addInventory(id clientIdentity) {
	acct := strings.TrimSpace(id.AccountID)
	if acct == "" {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if _, ok := p.inventory[acct]; ok {
		return
	}
	p.inventory[acct] = id
	p.stats.Inventory.Store(uint64(len(p.inventory)))
}

func (p *churnPool) ingestLoop(ctx context.Context) {
	if p.opts.GenCh == nil {
		return
	}
	for {
		select {
		case <-ctx.Done():
			return
		case ev, ok := <-p.opts.GenCh:
			if !ok {
				return
			}
			for _, id := range ev.Clients {
				p.addInventory(id)
			}
		}
	}
}

func (p *churnPool) schedulerLoop(ctx context.Context) {
	ticker := time.NewTicker(p.opts.TickEvery)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.scheduleOnce()
		}
	}
}

func (p *churnPool) targetRatio() float64 {
	if p.opts.LiveRatioFunc != nil {
		r := p.opts.LiveRatioFunc()
		if r <= 0 {
			return p.opts.LiveRatio
		}
		if r > 1 {
			return 1
		}
		return r
	}
	return p.opts.LiveRatio
}

func (p *churnPool) scheduleOnce() {
	if p.frozen.Load() {
		return
	}
	p.mu.Lock()
	invN := len(p.inventory)
	liveN := len(p.live)
	want := int(float64(invN)*p.targetRatio() + 0.5)
	if invN > 0 && want < 1 {
		want = 1
	}
	if want > invN {
		want = invN
	}

	var toJoin []clientIdentity
	var toLeave []string

	switch {
	case liveN < want:
		need := want - liveN
		for _, id := range p.inventory {
			if need <= 0 {
				break
			}
			acct := id.AccountID
			if p.live[acct] != nil || p.joining[acct] || p.leaving[acct] {
				continue
			}
			toJoin = append(toJoin, id)
			need--
		}
		p.rng.Shuffle(len(toJoin), func(i, j int) { toJoin[i], toJoin[j] = toJoin[j], toJoin[i] })
		for _, id := range toJoin {
			p.joining[id.AccountID] = true
		}
	case liveN > want:
		need := liveN - want
		liveAccts := make([]string, 0, liveN)
		for acct := range p.live {
			if p.leaving[acct] {
				continue
			}
			liveAccts = append(liveAccts, acct)
		}
		p.rng.Shuffle(len(liveAccts), func(i, j int) { liveAccts[i], liveAccts[j] = liveAccts[j], liveAccts[i] })
		for _, acct := range liveAccts {
			if need <= 0 {
				break
			}
			toLeave = append(toLeave, acct)
			p.leaving[acct] = true
			need--
		}
	case liveN == want && invN > liveN && want > 0:
		// Replacement churn: leave one live and join one offline so placement keeps moving.
		if time.Since(p.lastReplace) >= p.opts.ReplaceEvery {
			var offline []clientIdentity
			for _, id := range p.inventory {
				acct := id.AccountID
				if p.live[acct] != nil || p.joining[acct] || p.leaving[acct] {
					continue
				}
				offline = append(offline, id)
			}
			liveAccts := make([]string, 0, liveN)
			for acct := range p.live {
				if p.leaving[acct] {
					continue
				}
				liveAccts = append(liveAccts, acct)
			}
			if len(offline) > 0 && len(liveAccts) > 0 {
				leaveAcct := liveAccts[p.rng.IntN(len(liveAccts))]
				joinID := offline[p.rng.IntN(len(offline))]
				toLeave = append(toLeave, leaveAcct)
				toJoin = append(toJoin, joinID)
				p.leaving[leaveAcct] = true
				p.joining[joinID.AccountID] = true
				p.lastReplace = time.Now()
			}
		}
	}
	p.mu.Unlock()

	for _, id := range toJoin {
		p.enqueueJoin(id)
	}
	for _, acct := range toLeave {
		p.enqueueLeave(acct)
	}
}

func (p *churnPool) enqueueJoin(id clientIdentity) {
	select {
	case p.joinCh <- id:
	default:
		p.stats.JoinBlocked.Add(1)
		select {
		case p.joinCh <- id:
		case <-time.After(p.opts.TickEvery):
			p.mu.Lock()
			delete(p.joining, id.AccountID)
			p.mu.Unlock()
		}
	}
}

func (p *churnPool) enqueueLeave(accountID string) {
	select {
	case p.leaveCh <- accountID:
	default:
		p.stats.LeaveBlocked.Add(1)
		select {
		case p.leaveCh <- accountID:
		case <-time.After(p.opts.TickEvery):
			p.mu.Lock()
			delete(p.leaving, accountID)
			p.mu.Unlock()
		}
	}
}

func (p *churnPool) joinLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case id := <-p.joinCh:
			p.startLive(ctx, id)
		}
	}
}

func (p *churnPool) startLive(parent context.Context, id clientIdentity) {
	acct := strings.TrimSpace(id.AccountID)
	child, cancel := context.WithCancel(parent)
	done := make(chan struct{})
	w := &liveWorker{id: id, cancel: cancel, done: done}

	p.mu.Lock()
	if p.live[acct] != nil {
		p.mu.Unlock()
		cancel()
		p.mu.Lock()
		delete(p.joining, acct)
		p.mu.Unlock()
		return
	}
	p.live[acct] = w
	delete(p.joining, acct)
	p.stats.Live.Store(int64(len(p.live)))
	p.mu.Unlock()

	p.stats.Joins.Add(1)
	go func() {
		defer close(done)
		p.opts.RunIdentity(child, id)
		p.mu.Lock()
		if cur := p.live[acct]; cur == w {
			delete(p.live, acct)
			p.stats.Live.Store(int64(len(p.live)))
		}
		delete(p.leaving, acct)
		delete(p.joining, acct)
		p.mu.Unlock()
	}()
}

func (p *churnPool) leaveLoop(ctx context.Context, errCh chan<- error) {
	for {
		select {
		case <-ctx.Done():
			return
		case acct := <-p.leaveCh:
			if err := p.leaveOne(ctx, acct); err != nil {
				select {
				case errCh <- err:
				default:
				}
			}
		}
	}
}

func (p *churnPool) leaveOne(ctx context.Context, accountID string) error {
	accountID = strings.TrimSpace(accountID)
	if err := p.waitPendingClear(ctx, accountID); err != nil {
		// Force-leave even if expects are still open so churn can continue at scale.
		p.cancelLive(accountID)
		if ctx.Err() != nil {
			return nil // soak shutdown — not a leave_timeout
		}
		p.stats.LeaveTimeouts.Add(1)
		p.stats.Leaves.Add(1)
		if p.opts.OnLeaveTimeout != nil {
			p.opts.OnLeaveTimeout(accountID)
		}
		return nil
	}
	p.cancelLive(accountID)
	p.stats.Leaves.Add(1)
	return nil
}

func (p *churnPool) waitPendingClear(ctx context.Context, accountID string) error {
	if p.opts.Pending == nil {
		return nil
	}
	deadline := time.Now().Add(p.opts.LeaveTimeout)
	poll := p.opts.LeavePoll
	for {
		if !p.opts.Pending(accountID) {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("pending expect not cleared within %s", p.opts.LeaveTimeout)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(poll):
		}
	}
}

func (p *churnPool) cancelLive(accountID string) {
	p.mu.Lock()
	w := p.live[accountID]
	p.mu.Unlock()
	if w == nil {
		p.mu.Lock()
		delete(p.leaving, accountID)
		p.mu.Unlock()
		return
	}
	w.cancel()
	select {
	case <-w.done:
	case <-time.After(p.opts.LeaveTimeout):
	}
	p.mu.Lock()
	if cur := p.live[accountID]; cur == w {
		delete(p.live, accountID)
		p.stats.Live.Store(int64(len(p.live)))
	}
	delete(p.leaving, accountID)
	p.mu.Unlock()
}

func (p *churnPool) cancelAllLive() {
	p.mu.Lock()
	workers := make([]*liveWorker, 0, len(p.live))
	for _, w := range p.live {
		workers = append(workers, w)
	}
	p.mu.Unlock()
	for _, w := range workers {
		w.cancel()
	}
	for _, w := range workers {
		select {
		case <-w.done:
		case <-time.After(2 * time.Second):
		}
	}
}

// waitChurnLive waits until live workers reach want (or ctx ends).
func waitChurnLive(ctx context.Context, stats *ChurnPoolStats, want int64, poll time.Duration) error {
	if want <= 0 {
		return nil
	}
	if poll <= 0 {
		poll = 50 * time.Millisecond
	}
	for {
		if stats.Live.Load() >= want {
			return nil
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("wait churn live: have=%d want=%d: %w", stats.Live.Load(), want, ctx.Err())
		case <-time.After(poll):
		}
	}
}
