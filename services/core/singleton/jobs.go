// jobs.go is the catalog of singleton workloads that should run on exactly
// one core replica at a time. The generic plumbing lives in service.go;
// this file owns *which* jobs are wired in production.
//
// Process-level primary (scheduler, changestream) is driven by primarycontroller
// + servicemanager under lease:core:primary — not here. SDE ensure runs on every replica.
//
// Adding a new singleton workload: write a constructor below and append it
// to `allJobs`. Everything else (lease, renewer, scoped context, stop fn)
// is handled by `StartService`.

package singleton

import (
	"context"
	"errors"
	"sync"
	"time"

	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/stackservices"
)

// Lease keys used by the registered jobs. Kept as exported package
// constants so they're greppable from ops tooling (`redis-cli get …`) and
// reusable across tests that want to assert lease behaviour without
// duplicating string literals.
const (
	DoclockExpirySubscriberLeaseKey    = "lease:doclock:expiry-subscriber"
	AuthSessionMaintenanceLeaseKey     = "lease:auth:session-maintenance"
	authSessionMaintenanceLoopInterval = time.Hour
)

// DoclockExpirySubscriberJob builds the singleton.Job that drives the
// doc-lock TTL expiry subscriber. Exposed so tests can register just this
// one job without pulling in the whole catalog.
func DoclockExpirySubscriberJob(deps documentlock.Deps) Job {
	return Job{
		Name:     "doclock-expiry-subscriber",
		LeaseKey: DoclockExpirySubscriberLeaseKey,
		Run: func(ctx context.Context) error {
			return documentlock.RunExpirySubscriber(ctx, deps)
		},
	}
}

// AuthSessionMaintenanceJob runs hourly orphan session_index / refresh_token cleanup
// on a dedicated singleton lease (complements the worker cron that scans account_sessions).
func AuthSessionMaintenanceJob(clients *stackservices.Clients) Job {
	return Job{
		Name:     "auth-session-maintenance",
		LeaseKey: AuthSessionMaintenanceLeaseKey,
		Run: func(ctx context.Context) error {
			if clients == nil || clients.Redis == nil {
				return nil
			}
			return auth.RunAuthSessionMaintenanceLoop(ctx, clients.Redis, authSessionMaintenanceLoopInterval, auth.SessionCleanupOptionsFromEnv())
		},
	}
}

func allJobs(clients *stackservices.Clients) []Job {
	return []Job{
		DoclockExpirySubscriberJob(documentlock.DepsFromClients(clients)),
		AuthSessionMaintenanceJob(clients),
	}
}

// Start spawns every registered singleton workload and returns a Catalog
// that implements health.Component and lifecycle.Runner.
//
// Tests that want a custom subset can call StartService instead.
func Start(clients *stackservices.Clients) (*Catalog, error) {
	if clients == nil || clients.Redis == nil {
		return nil, errors.New("singleton: redis client is required")
	}
	stop, err := StartService(clients.Redis, allJobs(clients)...)
	if err != nil {
		return nil, err
	}
	cat := &Catalog{rdb: clients.Redis}
	cat.running.Store(true)
	var once sync.Once
	cat.stop = func() {
		once.Do(func() {
			cat.running.Store(false)
			stop()
		})
	}
	return cat, nil
}
