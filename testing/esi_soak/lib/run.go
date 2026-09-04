package esisoak

import (
	"context"
	"fmt"
	"maps"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"eve-industry-planner/shared/esiclient"

	"github.com/redis/go-redis/v9"
)

// Config describes the load to put through the limiter.
type Config struct {
	// Replicas is how many independent dispatchers share the clock. This is the
	// thing worth testing: one dispatcher paces itself trivially, several have
	// to agree through Redis.
	Replicas int
	// Callers is concurrent callers per replica.
	Callers int
	// Duration is how long to drive load for.
	Duration time.Duration
	// Mix is how many of each replica's callers use which class. Missing classes
	// contribute none.
	Mix map[esiclient.Class]int
	// Path is the endpoint to hammer.
	Path string
	// Adjust tunes the client config each replica is built with.
	Adjust func(*esiclient.Config)
}

// DefaultConfig is a short, hard run: enough replicas to contend and enough
// demand to exceed the allowance if nothing were pacing it.
func DefaultConfig() Config {
	return Config{
		Replicas: 4,
		Callers:  6,
		Duration: 5 * time.Second,
		Mix: map[esiclient.Class]int{
			esiclient.ClassBackground:    4,
			esiclient.ClassUserRequested: 1,
		},
		Path: "/markets/10000002/orders/",
	}
}

// ClassResult is one class's share of a run. Aggregates hide the questions that
// matter under a mixed load: whether a class kept its floor, and whether the
// classes that are supposed to be served first were.
type ClassResult struct {
	Class       string
	Served      int64
	NotModified int64
	Yielded     int64
	Tokens      int64
	MeanWait    time.Duration
}

// Share is this class's portion of the tokens the run spent.
func (c ClassResult) Share(total int64) float64 {
	if total == 0 {
		return 0
	}
	return float64(c.Tokens) / float64(total)
}

// Result is what the run observed, from both sides: what the fleet did, and
// what the origin thinks it was charged.
type Result struct {
	Replicas int
	Duration time.Duration

	Attempts     int64
	Succeeded    int64
	NotModified  int64
	Yielded      int64
	Errored      int64
	YieldsByKind map[string]int64

	ByClass map[esiclient.Class]ClassResult
	Origin  Stats

	// RedisCommands is what coordinating this run cost in round trips.
	RedisCommands int64
	RedisByName   map[string]int64

	// Overspend is how far past the allowance the origin was driven. Anything
	// above zero means the fleet spent budget it did not hold.
	Overspend int
	// Refused429 counts times the origin had to turn the fleet away. A correct
	// limiter never lets this happen.
	Refused429 int
}

func (r Result) String() string {
	return fmt.Sprintf(
		"%d replicas over %s: %d attempts, %d ok, %d not-modified, %d yielded, %d errors | "+
			"origin saw %d requests, peak spend %d/%d, refusals %d | yields %v",
		r.Replicas, r.Duration, r.Attempts, r.Succeeded, r.NotModified, r.Yielded, r.Errored,
		r.Origin.Requests, r.Origin.PeakSpend, r.Origin.Allowance, r.Origin.Refusals, r.YieldsByKind)
}

// Healthy reports whether the fleet stayed inside the budget.
func (r Result) Healthy() bool {
	return r.Overspend <= 0 && r.Refused429 == 0 && r.Succeeded > 0
}

// Run drives the load and reports what happened. The caller owns the origin and
// the Redis; nothing here creates or cleans them, so the same run works against
// a fake pair in a test and a real pair from the CLI.
func Run(ctx context.Context, cfg Config, origin *Origin, rdb *redis.Client) (Result, error) {
	meter := NewRedisMeter()
	meter.Attach(rdb)

	if cfg.Replicas <= 0 {
		cfg.Replicas = 1
	}
	if cfg.Duration <= 0 {
		cfg.Duration = 5 * time.Second
	}
	if cfg.Path == "" {
		cfg.Path = "/markets/10000002/orders/"
	}

	runCtx, cancel := context.WithTimeout(ctx, cfg.Duration)
	defer cancel()

	counters := newCounters()
	var replicas sync.WaitGroup

	for range cfg.Replicas {
		client, stop, err := buildReplica(cfg, origin, rdb)
		if err != nil {
			return Result{}, err
		}
		defer stop()

		replicas.Go(func() {
			driveReplica(runCtx, cfg, client, counters)
		})
	}
	replicas.Wait()

	stats := origin.Stats()
	return Result{
		Replicas:      cfg.Replicas,
		Duration:      cfg.Duration,
		Attempts:      counters.attempts.Load(),
		Succeeded:     counters.succeeded.Load(),
		NotModified:   counters.notModified.Load(),
		Yielded:       counters.yielded.Load(),
		Errored:       counters.errored.Load(),
		YieldsByKind:  counters.kinds(),
		ByClass:       counters.classes(),
		Origin:        stats,
		RedisCommands: meter.Total(),
		RedisByName:   meter.Breakdown(),
		Overspend:     max(stats.PeakSpend-stats.Allowance, 0),
		Refused429:    stats.Refusals,
	}, nil
}

// PerServed is commands sent per call actually served, which is the figure that
// compares fairly between runs of different throughput.
func (r Result) RedisPerServed() float64 {
	served := r.Succeeded + r.NotModified
	if served == 0 {
		return 0
	}
	return float64(r.RedisCommands) / float64(served)
}

func buildReplica(cfg Config, origin *Origin, rdb *redis.Client) (*esiclient.Client, func(), error) {
	clientCfg := esiclient.DefaultConfig()
	clientCfg.BaseURL = origin.URL()
	clientCfg.Transport = origin.Transport()
	clientCfg.Endpoints = []esiclient.EndpointPolicy{{
		Pattern:           "/markets/{region_id}/orders/",
		CompatibilityDate: "2025-12-16",
		MinSpacing:        20 * time.Millisecond,
		Conditional:       true,
	}}
	clientCfg.Tolerance = map[esiclient.Class]time.Duration{
		esiclient.ClassBackground:    250 * time.Millisecond,
		esiclient.ClassUserRequested: 2 * time.Second,
	}
	if cfg.Adjust != nil {
		cfg.Adjust(&clientCfg)
	}
	return esiclient.New(rdb, clientCfg)
}

func driveReplica(ctx context.Context, cfg Config, client *esiclient.Client, c *counters) {
	var callers sync.WaitGroup
	for class, count := range cfg.Mix {
		for range count {
			callers.Go(func() { drive(ctx, cfg, client, class, c) })
		}
	}
	callers.Wait()
}

func drive(ctx context.Context, cfg Config, client *esiclient.Client, class esiclient.Class, c *counters) {
	req := esiclient.Request{
		Method:      http.MethodGet,
		Path:        cfg.Path,
		Class:       class,
		IfNoneMatch: `"soak"`,
	}

	for ctx.Err() == nil {
		c.attempts.Add(1)
		started := time.Now()
		resp, err := client.Do(ctx, req)
		switch {
		case err == nil && resp.NotModified:
			c.notModified.Add(1)
			c.recordServed(class, resp.Cost, time.Since(started), true)
		case err == nil:
			c.succeeded.Add(1)
			c.recordServed(class, resp.Cost, time.Since(started), false)
		case ctx.Err() != nil:
			return
		default:
			if refusal, ok := esiclient.AsRateLimit(err); ok {
				c.yielded.Add(1)
				c.recordKind(refusal.Kind.String())
				c.recordYield(class)
				// Honour the time the limiter gave. A caller that spins instead
				// is not what asynq does, and it would hide whether the ETAs are
				// any good: sleep too long and throughput suffers, too short and
				// the yields pile up.
				if !sleepUntil(ctx, refusal.RetryAfter) {
					return
				}
				continue
			}
			c.errored.Add(1)
		}
	}
}

// sleepUntil waits for a refusal's ETA, capped so one long gate does not end the
// run early, and reports whether the context is still live.
func sleepUntil(ctx context.Context, at time.Time) bool {
	wait := min(max(time.Until(at), time.Millisecond), 2*time.Second)
	timer := time.NewTimer(wait)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

type counters struct {
	attempts    atomic.Int64
	succeeded   atomic.Int64
	notModified atomic.Int64
	yielded     atomic.Int64
	errored     atomic.Int64

	mu       sync.Mutex
	byReason map[string]int64
	byClass  map[esiclient.Class]*ClassResult
	waits    map[esiclient.Class]time.Duration
}

func newCounters() *counters {
	return &counters{
		byReason: map[string]int64{},
		byClass:  map[esiclient.Class]*ClassResult{},
		waits:    map[esiclient.Class]time.Duration{},
	}
}

func (c *counters) forClass(class esiclient.Class) *ClassResult {
	if existing, ok := c.byClass[class]; ok {
		return existing
	}
	created := &ClassResult{Class: class.String()}
	c.byClass[class] = created
	return created
}

func (c *counters) recordServed(class esiclient.Class, cost int, took time.Duration, notModified bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry := c.forClass(class)
	entry.Served++
	entry.Tokens += int64(cost)
	if notModified {
		entry.NotModified++
	}
	c.waits[class] += took
}

func (c *counters) recordYield(class esiclient.Class) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.forClass(class).Yielded++
}

func (c *counters) classes() map[esiclient.Class]ClassResult {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make(map[esiclient.Class]ClassResult, len(c.byClass))
	for class, entry := range c.byClass {
		result := *entry
		if result.Served > 0 {
			result.MeanWait = c.waits[class] / time.Duration(result.Served)
		}
		out[class] = result
	}
	return out
}

func (c *counters) recordKind(kind string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.byReason[kind]++
}

func (c *counters) kinds() map[string]int64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make(map[string]int64, len(c.byReason))
	maps.Copy(out, c.byReason)
	return out
}
