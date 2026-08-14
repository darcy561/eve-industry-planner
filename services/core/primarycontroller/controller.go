// Package primarycontroller elects a single core primary via Redis and notifies
// subscribers on acquire/loss. Holding the lease is not required for Ready;
// the election loop must be running and Redis reachable.
package primarycontroller

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"eve-industry-planner/shared/core/redis/lease"
	"eve-industry-planner/shared/logs"

	"github.com/redis/go-redis/v9"
)

// LeaseKey is the Redis key for core process leadership.
const LeaseKey = "lease:core:primary"

// DefaultUnhealthyReleaseGrace is how long Ready may fail while we believe we
// are leader before forcing lease release.
const DefaultUnhealthyReleaseGrace = 30 * time.Second

// State is the desired primary role for this process.
type State struct {
	IsLeader bool
}

// Service runs the Redis election loop and fans out State changes.
type Service struct {
	rdb       *redis.Client
	leaseID   string
	leaseOpts lease.Options

	mu       sync.Mutex
	subs     []chan State
	isLeader atomic.Bool
	started  atomic.Bool
	loopOK   atomic.Bool

	cancel context.CancelFunc
	wg     sync.WaitGroup
	stop   func()
}

// New builds a primary controller. Call Start to begin election.
func New(rdb *redis.Client) *Service {
	return &Service{
		rdb:     rdb,
		leaseID: lease.InstanceID() + ":primary",
	}
}

// WithLeaseOptions sets lease cadence before Start. Zero fields use lease defaults.
// Intended for tests that need faster takeover than DefaultTTL.
func (s *Service) WithLeaseOptions(opts lease.Options) *Service {
	if s != nil {
		s.leaseOpts = opts
	}
	return s
}

// Name implements health.Component / lifecycle.Runner.
func (s *Service) Name() string { return "primarycontroller" }

func (s *Service) msg(action string) string {
	return fmt.Sprintf("%s: %s", s.Name(), action)
}

// Start begins the election loop. Fails closed if redis is missing.
// The returned service implements lifecycle.Runner via Stop.
func Start(ctx context.Context, rdb *redis.Client) (*Service, error) {
	return StartWithOptions(ctx, rdb, lease.Options{})
}

// StartWithOptions is Start with explicit lease cadence (tests / tuning).
func StartWithOptions(ctx context.Context, rdb *redis.Client, opts lease.Options) (*Service, error) {
	s := New(rdb).WithLeaseOptions(opts)
	if err := s.start(ctx); err != nil {
		return nil, err
	}
	return s, nil
}

// Start begins the election loop on an existing Service (tests).
func (s *Service) Start(ctx context.Context) error {
	return s.start(ctx)
}

func (s *Service) start(ctx context.Context) error {
	if s == nil || s.rdb == nil {
		return errors.New("primarycontroller: redis client is required")
	}
	runCtx, cancel := context.WithCancel(ctx)
	s.cancel = cancel
	s.started.Store(true)
	s.loopOK.Store(true)

	s.wg.Go(func() {
		defer s.loopOK.Store(false)
		err := lease.RunWhileHeld(runCtx, s.rdb, LeaseKey, s.leaseID, s.leaseOpts, func(scoped context.Context) error {
			logs.InfoCtx(scoped, s.msg("acquired primary lease"),
				"component", s.Name(), "lease_key", LeaseKey, "lease_id", s.leaseID)
			s.setLeader(true)
			<-scoped.Done()
			s.setLeader(false)
			logs.InfoCtx(ctx, s.msg("released or lost primary lease"),
				"component", s.Name(), "lease_key", LeaseKey, "lease_id", s.leaseID)
			return scoped.Err()
		})
		if err != nil && !errors.Is(err, context.Canceled) {
			logs.WarnCtx(ctx, s.msg("lease loop exited"),
				"component", s.Name(), "error", err, "lease_key", LeaseKey)
			s.loopOK.Store(false)
		}
	})

	var stopOnce sync.Once
	s.stop = func() {
		stopOnce.Do(func() {
			cancel()
			relCtx, relCancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer relCancel()
			if err := s.Release(relCtx); err != nil {
				logs.WarnCtx(context.Background(), s.msg("release on stop failed"),
					"component", s.Name(), "error", err)
			}
			s.wg.Wait()
			s.started.Store(false)
			s.loopOK.Store(false)
			s.setLeader(false)
		})
	}
	return nil
}

// Stop implements lifecycle.Runner.
func (s *Service) Stop(context.Context) {
	if s != nil && s.stop != nil {
		s.stop()
	}
}

// Subscribe returns a fan-out channel. Current state is sent immediately.
// Sends coalesce to the latest state; the lease loop never blocks on slow consumers.
func (s *Service) Subscribe() <-chan State {
	ch := make(chan State, 1)
	s.mu.Lock()
	s.subs = append(s.subs, ch)
	cur := State{IsLeader: s.isLeader.Load()}
	s.mu.Unlock()
	ch <- cur
	return ch
}

// IsLeader reports whether this process currently holds the primary lease.
func (s *Service) IsLeader() bool { return s.isLeader.Load() }

// Ready is true when the election loop is running and Redis answers ping.
func (s *Service) Ready(ctx context.Context) error {
	if s == nil || !s.started.Load() || !s.loopOK.Load() {
		return errors.New("election loop not running")
	}
	if s.rdb == nil {
		return errors.New("redis missing")
	}
	if err := s.rdb.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("redis: %w", err)
	}
	return nil
}

// Release best-effort deletes the lease if we still hold it.
func (s *Service) Release(ctx context.Context) error {
	if s == nil || s.rdb == nil {
		return errors.New("primarycontroller: redis client is required")
	}
	if err := lease.ReleaseIfMine(ctx, s.rdb, LeaseKey, s.leaseID); err != nil {
		return err
	}
	logs.WarnCtx(ctx, s.msg("lease release requested"),
		"component", s.Name(), "lease_key", LeaseKey, "lease_id", s.leaseID)
	return nil
}

func (s *Service) setLeader(v bool) {
	s.isLeader.Store(v)
	st := State{IsLeader: v}
	s.mu.Lock()
	subs := append([]chan State(nil), s.subs...)
	s.mu.Unlock()
	role := "standby"
	if v {
		role = "leader"
	}
	logs.InfoCtx(context.Background(), s.msg(fmt.Sprintf("notifying listeners role=%s count=%d", role, len(subs))),
		"component", s.Name(), "is_leader", v, "listeners", len(subs), "lease_key", LeaseKey, "role", role)
	for _, ch := range subs {
		select {
		case ch <- st:
		default:
			select {
			case <-ch:
			default:
			}
			select {
			case ch <- st:
			default:
			}
		}
	}
}

// WatchUnhealthyRelease releases the lease if check fails for grace while leader.
func WatchUnhealthyRelease(ctx context.Context, s *Service, check func(context.Context) error, grace time.Duration) {
	if s == nil || check == nil {
		return
	}
	if grace <= 0 {
		grace = DefaultUnhealthyReleaseGrace
	}
	go func() {
		t := time.NewTicker(2 * time.Second)
		defer t.Stop()
		var since time.Time
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				if !s.IsLeader() {
					since = time.Time{}
					continue
				}
				cctx, cancel := context.WithTimeout(ctx, 3*time.Second)
				err := check(cctx)
				cancel()
				if err == nil {
					since = time.Time{}
					continue
				}
				if since.IsZero() {
					since = time.Now()
					logs.WarnCtx(ctx, s.msg("ready failing while leader"),
						"component", s.Name(), "error", err)
					continue
				}
				if time.Since(since) < grace {
					continue
				}
				logs.ErrorCtx(ctx, s.msg("releasing lease after unhealthy grace"),
					"component", s.Name(), "error", err, "grace", grace.String(), "lease_key", LeaseKey)
				rctx, rcancel := context.WithTimeout(context.Background(), 3*time.Second)
				_ = s.Release(rctx)
				rcancel()
				since = time.Now()
			}
		}
	}()
}
