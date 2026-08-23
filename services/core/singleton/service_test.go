package singleton

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"

	"eve-industry-planner/shared/core/redis/lease"
	"eve-industry-planner/testing/redisfake"
	"eve-industry-planner/testing/wait"
)

type silentLogger struct{}

func (silentLogger) Debugf(context.Context, string, ...any) {}
func (silentLogger) Warnf(context.Context, string, ...any)  {}

func fastOpts() lease.Options {
	return lease.Options{
		TTL:            300 * time.Millisecond,
		RenewInterval:  60 * time.Millisecond,
		AcquireBackoff: 60 * time.Millisecond,
		Logger:         silentLogger{},
	}
}

// TestStartService_RunsAllRegisteredJobs proves multi-job registration:
// each Job runs concurrently under its own lease and observes its own
// scoped context.
func TestStartService_RunsAllRegisteredJobs(t *testing.T) {
	t.Parallel()
	rdb := redisfake.New(t).Client

	var aCount, bCount atomic.Int32
	aEntered := make(chan struct{}, 1)
	bEntered := make(chan struct{}, 1)

	stop, err := StartService(rdb,
		Job{
			Name:     "job-a",
			LeaseKey: "lease:test:job-a",
			Options:  fastOpts(),
			Run: func(ctx context.Context) error {
				aCount.Add(1)
				aEntered <- struct{}{}
				<-ctx.Done()
				return nil
			},
		},
		Job{
			Name:     "job-b",
			LeaseKey: "lease:test:job-b",
			Options:  fastOpts(),
			Run: func(ctx context.Context) error {
				bCount.Add(1)
				bEntered <- struct{}{}
				<-ctx.Done()
				return nil
			},
		},
	)
	if err != nil {
		t.Fatalf("StartService: %v", err)
	}
	defer stop()

	for _, ch := range []chan struct{}{aEntered, bEntered} {
		select {
		case <-ch:
		case <-time.After(1 * time.Second):
			t.Fatalf("a job never started")
		}
	}
	if aCount.Load() != 1 || bCount.Load() != 1 {
		t.Fatalf("expected each job to be entered once, got a=%d b=%d", aCount.Load(), bCount.Load())
	}
}

// TestStartService_OnlyOneLeaderPerJob runs two `singleton` services
// against the same Redis with the same Job config (simulating two
// replicas) and asserts only one of them runs the Job at any moment.
func TestStartService_OnlyOneLeaderPerJob(t *testing.T) {
	t.Parallel()
	rdb := redisfake.New(t).Client

	var (
		mu          sync.Mutex
		concurrent  int
		maxObserved int
		invocations atomic.Int32
	)

	makeJob := func() Job {
		return Job{
			Name:     "shared-job",
			LeaseKey: "lease:test:shared",
			Options:  fastOpts(),
			Run: func(ctx context.Context) error {
				invocations.Add(1)
				mu.Lock()
				concurrent++
				if concurrent > maxObserved {
					maxObserved = concurrent
				}
				mu.Unlock()
				defer func() {
					mu.Lock()
					concurrent--
					mu.Unlock()
				}()
				<-ctx.Done()
				return nil
			},
		}
	}

	stopA, err := StartService(rdb, makeJob())
	if err != nil {
		t.Fatalf("StartService A: %v", err)
	}
	defer stopA()
	stopB, err := StartService(rdb, makeJob())
	if err != nil {
		t.Fatalf("StartService B: %v", err)
	}
	defer stopB()

	time.Sleep(400 * time.Millisecond)
	mu.Lock()
	if concurrent != 1 {
		t.Fatalf("expected exactly one leader, observed %d", concurrent)
	}
	if maxObserved > 1 {
		t.Fatalf("two replicas held the lease simultaneously (max=%d)", maxObserved)
	}
	mu.Unlock()
}

// TestStartService_StopDrainsAllJobs proves the returned stop fn cancels
// every Job and waits for every goroutine to exit before returning.
func TestStartService_StopDrainsAllJobs(t *testing.T) {
	t.Parallel()
	rdb := redisfake.New(t).Client

	var aExited, bExited atomic.Bool

	stop, err := StartService(rdb,
		Job{
			Name:     "job-a",
			LeaseKey: "lease:test:drain-a",
			Options:  fastOpts(),
			Run: func(ctx context.Context) error {
				<-ctx.Done()
				aExited.Store(true)
				return nil
			},
		},
		Job{
			Name:     "job-b",
			LeaseKey: "lease:test:drain-b",
			Options:  fastOpts(),
			Run: func(ctx context.Context) error {
				<-ctx.Done()
				bExited.Store(true)
				return nil
			},
		},
	)
	if err != nil {
		t.Fatalf("StartService: %v", err)
	}

	// Let leaders establish.
	time.Sleep(150 * time.Millisecond)

	stop()

	if !aExited.Load() || !bExited.Load() {
		t.Fatalf("stop returned before all jobs exited (a=%v b=%v)", aExited.Load(), bExited.Load())
	}

	// stop must be idempotent.
	stop()
}

// TestStartService_TransientErrorIsRecovered ensures a Job returning a
// transient error gets re-invoked (no permanent stop on bad luck).
func TestStartService_TransientErrorIsRecovered(t *testing.T) {
	t.Parallel()
	rdb := redisfake.New(t).Client

	var calls atomic.Int32
	stop, err := StartService(rdb, Job{
		Name:     "flaky",
		LeaseKey: "lease:test:flaky",
		Options:  fastOpts(),
		Run: func(ctx context.Context) error {
			n := calls.Add(1)
			if n == 1 {
				return errors.New("simulated transient failure")
			}
			<-ctx.Done()
			return nil
		},
	})
	if err != nil {
		t.Fatalf("StartService: %v", err)
	}
	defer stop()

	wait.For(t, 2*time.Second, func() (bool, string) {
		return calls.Load() >= 2,
			fmt.Sprintf("expected Job.Run to be re-invoked after error, got %d calls", calls.Load())
	})
}

// TestStartService_ValidationErrors covers all config-error paths so
// programmer mistakes fail loudly at startup.
func TestStartService_ValidationErrors(t *testing.T) {
	t.Parallel()
	rdb := redisfake.New(t).Client

	noop := func(context.Context) error { return nil }

	cases := []struct {
		name      string
		client    *redis.Client
		jobs      []Job
		wantMatch string
	}{
		{
			name:      "nil_redis_client",
			client:    nil,
			jobs:      []Job{{Name: "x", LeaseKey: "k", Run: noop}},
			wantMatch: "redis client is required",
		},
		{
			name:      "no_jobs",
			client:    rdb,
			jobs:      nil,
			wantMatch: "at least one Job",
		},
		{
			name:      "missing_name",
			client:    rdb,
			jobs:      []Job{{LeaseKey: "k", Run: noop}},
			wantMatch: "Name is required",
		},
		{
			name:      "missing_lease_key",
			client:    rdb,
			jobs:      []Job{{Name: "x", Run: noop}},
			wantMatch: "LeaseKey is required",
		},
		{
			name:      "missing_run",
			client:    rdb,
			jobs:      []Job{{Name: "x", LeaseKey: "k"}},
			wantMatch: "Run is required",
		},
		{
			name:   "duplicate_lease_key",
			client: rdb,
			jobs: []Job{
				{Name: "a", LeaseKey: "shared", Run: noop},
				{Name: "b", LeaseKey: "shared", Run: noop},
			},
			wantMatch: "reused",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			stop, err := StartService(tc.client, tc.jobs...)
			if err == nil {
				if stop != nil {
					stop()
				}
				t.Fatalf("expected error for %s", tc.name)
			}
			if !strings.Contains(err.Error(), tc.wantMatch) {
				t.Fatalf("error %q does not contain %q", err.Error(), tc.wantMatch)
			}
		})
	}
}
