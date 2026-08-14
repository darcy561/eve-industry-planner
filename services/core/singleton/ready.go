package singleton

import (
	"context"
	"errors"
	"fmt"
	"sync/atomic"

	"github.com/redis/go-redis/v9"
)

// Catalog is the running singleton service; implements health.Component and lifecycle.Runner.
type Catalog struct {
	rdb     *redis.Client
	running atomic.Bool
	stop    func()
}

// Name implements health.Component / lifecycle.Runner.
func (c *Catalog) Name() string { return "singleton" }

// Ready is true when lease runners were started and Redis is reachable.
// Does not require holding any singleton lease.
func (c *Catalog) Ready(ctx context.Context) error {
	if c == nil || !c.running.Load() {
		return errors.New("singleton runners not running")
	}
	if c.rdb == nil {
		return errors.New("redis missing")
	}
	if err := c.rdb.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("redis: %w", err)
	}
	return nil
}

// Stop implements lifecycle.Runner.
func (c *Catalog) Stop(context.Context) {
	if c != nil && c.stop != nil {
		c.stop()
	}
}
