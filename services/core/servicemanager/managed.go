// Package servicemanager applies primarycontroller.State changes to a start/stop
// workload and exposes pull Ready for changeover success (standby ack or leader start OK).
package servicemanager

import (
	"context"
	"errors"
	"fmt"
	"sync"

	"eve-industry-planner/core/primarycontroller"
	"eve-industry-planner/shared/logs"
)

// StartLeader starts leader-only work and returns a stop func.
type StartLeader func(ctx context.Context) (func(), error)

// Managed tracks desired primary state vs applied start/stop for one service.
type Managed struct {
	name  string
	start StartLeader

	mu             sync.Mutex
	applying       bool
	hasApplied     bool
	desired        primarycontroller.State
	applyErr       error
	stickyLeadFail error // set on failed become-leader; cleared only on successful leader start
	stopWork       func()
	stopFollow     func()
}

// New builds a managed service. name is used in Ready errors and logs.
func New(name string, start StartLeader) *Managed {
	return &Managed{name: name, start: start}
}

// Name implements health.Component.
func (m *Managed) Name() string { return m.name }

// msg prefixes the managed service name so docker/Loki msg filters show who logged.
func (m *Managed) msg(action string) string {
	name := "unknown"
	if m != nil && m.name != "" {
		name = m.name
	}
	return fmt.Sprintf("servicemanager/%s: %s", name, action)
}

// Follow consumes primarycontroller states until ctx is done.
// The Managed value implements lifecycle.Runner via Stop.
func (m *Managed) Follow(ctx context.Context, states <-chan primarycontroller.State) error {
	if m == nil || m.start == nil {
		return errors.New("servicemanager: start func required")
	}
	if states == nil {
		return errors.New("servicemanager: states channel required")
	}

	logs.InfoCtx(ctx, m.msg("following primarycontroller"), "component", m.name)

	runCtx, cancel := context.WithCancel(ctx)
	var wg sync.WaitGroup
	wg.Go(func() {
		for {
			select {
			case <-runCtx.Done():
				logs.InfoCtx(ctx, m.msg("follow stopped; forcing standby"), "component", m.name)
				m.apply(ctx, primarycontroller.State{IsLeader: false})
				return
			case st, ok := <-states:
				if !ok {
					logs.InfoCtx(ctx, m.msg("primary channel closed; forcing standby"), "component", m.name)
					m.apply(ctx, primarycontroller.State{IsLeader: false})
					return
				}
				m.apply(ctx, st)
			}
		}
	})

	var once sync.Once
	m.stopFollow = func() {
		once.Do(func() {
			cancel()
			wg.Wait()
		})
	}
	return nil
}

// Stop implements lifecycle.Runner.
func (m *Managed) Stop(context.Context) {
	if m != nil && m.stopFollow != nil {
		m.stopFollow()
	}
}

// Ready reports changeover health.
func (m *Managed) Ready(ctx context.Context) error {
	_ = ctx
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.stickyLeadFail != nil {
		return m.stickyLeadFail
	}
	if m.applying {
		return fmt.Errorf("applying primary state is_leader=%v", m.desired.IsLeader)
	}
	if !m.hasApplied {
		return errors.New("waiting for initial primary state")
	}
	if m.applyErr != nil && m.desired.IsLeader {
		return m.applyErr
	}
	return nil
}

func (m *Managed) apply(ctx context.Context, st primarycontroller.State) {
	m.mu.Lock()
	if m.hasApplied && !m.applying && m.desired == st && m.applyErr == nil {
		m.mu.Unlock()
		return
	}
	m.applying = true
	m.desired = st
	m.applyErr = nil
	prevStop := m.stopWork
	m.stopWork = nil
	m.mu.Unlock()

	role := "standby"
	if st.IsLeader {
		role = "leader"
	}
	logs.InfoCtx(ctx, m.msg("changeover acknowledged"),
		"component", m.name, "role", role, "is_leader", st.IsLeader)

	if prevStop != nil {
		logs.InfoCtx(ctx, m.msg("stopping previous leader work"), "component", m.name)
		prevStop()
		logs.InfoCtx(ctx, m.msg("previous leader work stopped"), "component", m.name)
	}

	var applyErr error
	var stopWork func()
	if st.IsLeader {
		logs.InfoCtx(ctx, m.msg("starting leader work"), "component", m.name)
		stopWork, applyErr = m.start(ctx)
		if applyErr != nil {
			logs.ErrorCtx(ctx, m.msg("changeover failed"),
				"component", m.name, "role", role, "is_leader", true, "error", applyErr)
			stopWork = nil
		} else {
			logs.InfoCtx(ctx, m.msg("leader work started"), "component", m.name)
		}
	}

	m.mu.Lock()
	m.stopWork = stopWork
	m.applyErr = applyErr
	if st.IsLeader {
		if applyErr != nil {
			m.stickyLeadFail = fmt.Errorf("leader start failed: %w", applyErr)
		} else {
			m.stickyLeadFail = nil
		}
	}
	m.applying = false
	m.hasApplied = true
	m.mu.Unlock()

	if applyErr == nil {
		logs.InfoCtx(ctx, m.msg("changeover complete"),
			"component", m.name, "role", role, "is_leader", st.IsLeader)
	}
}
