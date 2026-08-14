// Package lease provides a small Redis-backed leader-election primitive
// for "only run this on one replica at a time" workloads.
//
// It is a sibling subpackage of `shared/core/redis` — the host package
// owns generic GET/SET helpers, this subpackage owns the lease state
// machine. Callers typically import it as `lease` (no alias needed):
//
//	import "eve-industry-planner/shared/core/redis/lease"
//	stop, err := lease.RunWhileHeld(ctx, rdb, "lease:foo", lease.InstanceID(), opts, fn)
//
// # Why this exists
//
// Some background loops in this codebase are safe to run from multiple
// replicas but waste resources (or emit duplicate events) when they do —
// the canonical case is the doc-lock TTL expiry subscriber, which races on
// keyspace-notification events from every API replica even though only one
// of them can ever win the underlying state transition. Wrapping such
// loops in `RunWhileHeld` ensures a single elected replica drives the work.
//
// # Design
//
//	┌──────────┐        SET key id NX EX ttl       ┌────────────┐
//	│ Replica  │ ────────────────────────────────▶ │   Redis    │
//	│  loop    │ ◀──── PEXPIRE-if-still-mine ────  │   key      │
//	└──────────┘   (every RenewInterval, CAS Lua)  └────────────┘
//
// The lease key stores a per-process instance identifier as its value. We
// only ever PEXPIRE/DEL the key if the value still matches our identifier
// (a CAS via Lua), so even a brutally-paused renewer can't refresh a
// lease that's already been re-acquired by another replica.
//
// If the renewer can't reach Redis or finds the lease has been re-assigned,
// it cancels the scoped context passed to `fn`, releases (best-effort), and
// the outer loop restarts the acquire attempt with backoff.
//
// # Not a distributed lock
//
// This primitive is intended for "soft" coordination of singleton workers
// — duplicate work is recoverable (state transitions are atomic) but
// undesirable. It deliberately doesn't try to be a Redlock-grade
// distributed mutex. Don't use it for mutual exclusion of correctness-
// sensitive operations.
package lease

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"eve-industry-planner/shared/container"
	"eve-industry-planner/shared/logs"
)

// Defaults tuned for "leader is responsive but failure recovery is bounded".
//
// TTL controls how long after a replica vanishes another can take over.
// RenewInterval is roughly TTL/3 so two missed renews still leave headroom
// before the lease lapses. AcquireBackoff smooths out re-acquire storms.
const (
	DefaultTTL            = 15 * time.Second
	DefaultRenewInterval  = 5 * time.Second
	DefaultAcquireBackoff = 5 * time.Second
)

// Options controls lease cadence. All zero-valued fields fall back to the
// package defaults — callers usually only override TTL/RenewInterval for
// tests.
type Options struct {
	TTL            time.Duration
	RenewInterval  time.Duration
	AcquireBackoff time.Duration
	// JitterFraction adds up to this fraction of AcquireBackoff as random
	// jitter on the wait between acquire attempts. 0 disables jitter.
	JitterFraction float64
	// Logger overrides the default `logs` package. Useful for tests that
	// want silent runs.
	Logger Logger
}

// Logger lets callers (and tests) plug in a quieter logger. The default
// uses the project-wide structured logger.
type Logger interface {
	Debugf(ctx context.Context, msg string, fields ...any)
	Warnf(ctx context.Context, msg string, fields ...any)
}

type defaultLogger struct{}

func (defaultLogger) Debugf(ctx context.Context, msg string, fields ...any) {
	logs.DebugCtx(ctx, msg, fields...)
}
func (defaultLogger) Warnf(ctx context.Context, msg string, fields ...any) {
	logs.WarnCtx(ctx, msg, fields...)
}

func (o Options) withDefaults() Options {
	if o.TTL <= 0 {
		o.TTL = DefaultTTL
	}
	if o.RenewInterval <= 0 {
		o.RenewInterval = DefaultRenewInterval
	}
	if o.AcquireBackoff <= 0 {
		o.AcquireBackoff = DefaultAcquireBackoff
	}
	if o.JitterFraction < 0 {
		o.JitterFraction = 0
	}
	if o.JitterFraction > 1 {
		o.JitterFraction = 1
	}
	if o.Logger == nil {
		o.Logger = defaultLogger{}
	}
	return o
}

// renewIfMineScript renews the lease's TTL only if the value still equals
// our instance id. The CAS is essential — a stalled renewer goroutine
// otherwise refreshes a key that a peer has already taken over.
//
//	KEYS[1] = lease key
//	ARGV[1] = instance id
//	ARGV[2] = new TTL in milliseconds
//
// Returns 1 if the lease was renewed, 0 otherwise.
var renewIfMineScript = redis.NewScript(`
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
end
return 0
`)

// releaseIfMineScript deletes the lease key only if we still hold it.
//
//	KEYS[1] = lease key
//	ARGV[1] = instance id
//
// Returns 1 if the key was deleted, 0 otherwise.
var releaseIfMineScript = redis.NewScript(`
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`)

// InstanceID returns a per-hold lease value: "<container.ID()>:<uuid>".
//
// The container-id prefix makes a held lease attributable in `KEYS *`
// inspection; the UUID suffix guarantees uniqueness across restarts so a
// resurrected process can't accidentally refresh its own (now-expired)
// stale lease.
func InstanceID() string {
	return container.ID() + ":" + strings.TrimSpace(uuid.NewString())
}

// RunWhileHeld blocks until ctx is cancelled. It acquires the named lease,
// runs `fn` under a derived context, renews the lease in the background,
// and re-acquires whenever the lease is lost (Redis pause, takeover, etc).
//
// The contract:
//   - `fn` MUST observe its context — when the lease is lost the scoped
//     context is cancelled and `fn` should stop work promptly.
//   - `fn` may return an error to indicate a transient failure; the lease
//     is released and re-acquisition continues. Use a clean return (nil)
//     for graceful "I'm done" shutdowns triggered by context cancellation.
//   - Concurrent callers are serialized by Redis itself: only one replica
//     can hold the lease at a time.
//
// `key` is the Redis lease key (e.g. `lease:doclock:expiry-subscriber`).
// `instanceID` should be stable per-process; use InstanceID() unless you
// have a reason to override.
func RunWhileHeld(
	ctx context.Context,
	client *redis.Client,
	key, instanceID string,
	opts Options,
	fn func(ctx context.Context) error,
) error {
	if client == nil {
		return errors.New("redis lease: redis client is required")
	}
	if strings.TrimSpace(key) == "" {
		return errors.New("redis lease: lease key is required")
	}
	if strings.TrimSpace(instanceID) == "" {
		return errors.New("redis lease: instance id is required")
	}
	if fn == nil {
		return errors.New("redis lease: fn is required")
	}
	opts = opts.withDefaults()

	for {
		if err := ctx.Err(); err != nil {
			return err
		}

		acquired, err := acquire(ctx, client, key, instanceID, opts.TTL)
		if err != nil {
			opts.Logger.Warnf(ctx, "redis lease: acquire failed",
				"error", err,
				"lease_key", key,
				"instance_id", instanceID,
			)
			if !sleepWithCtx(ctx, opts.AcquireBackoff, opts.JitterFraction) {
				return ctx.Err()
			}
			continue
		}
		if !acquired {
			if !sleepWithCtx(ctx, opts.AcquireBackoff, opts.JitterFraction) {
				return ctx.Err()
			}
			continue
		}

		opts.Logger.Debugf(ctx, "redis lease: leader elected",
			"lease_key", key,
			"instance_id", instanceID,
			"ttl_ms", opts.TTL.Milliseconds(),
		)

		runFnUnderLease(ctx, client, key, instanceID, opts, fn)

		// Best-effort release: failure here only matters during deploy
		// overlap, and a stale lease will TTL out on its own.
		if err := releaseIfMine(context.Background(), client, key, instanceID); err != nil {
			opts.Logger.Warnf(ctx, "redis lease: release failed",
				"error", err,
				"lease_key", key,
			)
		}
	}
}

// runFnUnderLease starts the renewer + runs fn. Returns when fn returns or
// the lease is lost. The outer loop in RunWhileHeld handles release and
// re-acquisition.
func runFnUnderLease(
	parent context.Context,
	client *redis.Client,
	key, instanceID string,
	opts Options,
	fn func(ctx context.Context) error,
) {
	scoped, cancel := context.WithCancel(parent)
	defer cancel()

	renewDone := make(chan struct{})
	go func() {
		defer close(renewDone)
		runRenewer(scoped, client, key, instanceID, opts)
		cancel()
	}()

	if err := fn(scoped); err != nil && !errors.Is(err, context.Canceled) {
		opts.Logger.Warnf(parent, "redis lease: fn returned error",
			"error", err,
			"lease_key", key,
		)
	}

	cancel()
	<-renewDone
}

// runRenewer ticks every RenewInterval and CAS-renews the lease TTL. Two
// consecutive failures (Redis error or "lease no longer ours") cancel the
// scoped context, which the caller propagates to fn.
//
// One miss is allowed because transient Redis blips happen; two in a row
// strongly suggests we've genuinely lost the lease.
func runRenewer(ctx context.Context, client *redis.Client, key, instanceID string, opts Options) {
	ticker := time.NewTicker(opts.RenewInterval)
	defer ticker.Stop()

	const maxConsecutiveFailures = 2
	var consecutiveFailures int

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			ok, err := renewIfMine(ctx, client, key, instanceID, opts.TTL)
			if err != nil {
				consecutiveFailures++
				opts.Logger.Warnf(ctx, "redis lease: renew failed",
					"error", err,
					"lease_key", key,
					"consecutive_failures", consecutiveFailures,
				)
				if consecutiveFailures >= maxConsecutiveFailures {
					return
				}
				continue
			}
			if !ok {
				opts.Logger.Warnf(ctx, "redis lease: lease lost (no longer ours)",
					"lease_key", key,
					"instance_id", instanceID,
				)
				return
			}
			consecutiveFailures = 0
		}
	}
}

// acquire returns true if we successfully claimed the lease (SET NX EX).
func acquire(ctx context.Context, client *redis.Client, key, instanceID string, ttl time.Duration) (bool, error) {
	ok, err := client.SetNX(ctx, key, instanceID, ttl).Result()
	if err != nil {
		return false, fmt.Errorf("setnx: %w", err)
	}
	return ok, nil
}

// renewIfMine returns true if we still held the lease and refreshed its TTL.
func renewIfMine(ctx context.Context, client *redis.Client, key, instanceID string, ttl time.Duration) (bool, error) {
	res, err := renewIfMineScript.Run(ctx, client, []string{key}, instanceID, ttl.Milliseconds()).Int64()
	if err != nil {
		return false, fmt.Errorf("renew script: %w", err)
	}
	return res == 1, nil
}

// ReleaseIfMine deletes the lease key if our id still matches. No-op if we
// no longer hold it. Used for shutdown and unhealthy-leader forced release.
func ReleaseIfMine(ctx context.Context, client *redis.Client, key, instanceID string) error {
	if client == nil {
		return errors.New("redis lease: redis client is required")
	}
	if _, err := releaseIfMineScript.Run(ctx, client, []string{key}, instanceID).Result(); err != nil && !errors.Is(err, redis.Nil) {
		return fmt.Errorf("release script: %w", err)
	}
	return nil
}

// releaseIfMine is the internal alias used by RunWhileHeld.
func releaseIfMine(ctx context.Context, client *redis.Client, key, instanceID string) error {
	return ReleaseIfMine(ctx, client, key, instanceID)
}

// sleepWithCtx blocks for d (plus optional jitter) but returns early on
// ctx cancellation. Returns true if the sleep completed.
func sleepWithCtx(ctx context.Context, d time.Duration, jitterFraction float64) bool {
	if d <= 0 {
		return ctx.Err() == nil
	}
	if jitterFraction > 0 {
		extra := time.Duration(rand.Float64() * jitterFraction * float64(d))
		d += extra
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}
