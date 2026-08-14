// Package health aggregates pull Ready checks for core orchestration probes.
package health

import (
	"context"
	"fmt"
	"sync"

	"eve-industry-planner/shared/lifecycle"
)

// Component reports live health/ready status for one core subsystem.
type Component interface {
	Name() string
	Ready(ctx context.Context) error
}

// Mountable is a long-lived subsystem that is both a lifecycle.Runner and a Ready check.
type Mountable interface {
	lifecycle.Runner
	Component
}

// Mount adds each item to the lifecycle group and the Ready registry.
func Mount(g *lifecycle.Group, items ...Mountable) {
	if g == nil {
		return
	}
	for _, item := range items {
		if item == nil {
			continue
		}
		g.Add(item)
		Register(item)
	}
}

type registry struct {
	mu   sync.RWMutex
	list []Component
}

var defaultRegistry = &registry{}

// Register adds a component to the default registry (pointer kept; Ready called live).
func Register(c Component) {
	if c == nil {
		return
	}
	defaultRegistry.mu.Lock()
	defer defaultRegistry.mu.Unlock()
	defaultRegistry.list = append(defaultRegistry.list, c)
}

// Check runs Ready on every registered component. First error wins.
func Check(ctx context.Context) error {
	defaultRegistry.mu.RLock()
	comps := append([]Component(nil), defaultRegistry.list...)
	defaultRegistry.mu.RUnlock()

	for _, c := range comps {
		if err := c.Ready(ctx); err != nil {
			return fmt.Errorf("%s: %w", c.Name(), err)
		}
	}
	return nil
}

// ResetForTest clears the default registry (tests only).
func ResetForTest() {
	defaultRegistry.mu.Lock()
	defer defaultRegistry.mu.Unlock()
	defaultRegistry.list = nil
}

// Func adapts a name + Ready func into a Component.
type Func struct {
	ComponentName string
	Fn            func(ctx context.Context) error
}

func (f Func) Name() string { return f.ComponentName }

func (f Func) Ready(ctx context.Context) error {
	if f.Fn == nil {
		return fmt.Errorf("ready func nil")
	}
	return f.Fn(ctx)
}
