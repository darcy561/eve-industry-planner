// jobs.go is the catalog of singleton workloads that should run on exactly
// one core replica at a time. The generic plumbing lives in service.go;
// this file owns *which* jobs are wired in production.
//
// Adding a new singleton workload: write a constructor below and append it
// to `allJobs`. Everything else (lease, renewer, scoped context, stop fn)
// is handled by `StartService`.

package singleton

import (
	"context"

	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/shared"
)

// Lease keys used by the registered jobs. Kept as exported package
// constants so they're greppable from ops tooling (`redis-cli get …`) and
// reusable across tests that want to assert lease behaviour without
// duplicating string literals.
const (
	DoclockExpirySubscriberLeaseKey = "lease:doclock:expiry-subscriber"
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

// allJobs returns every singleton workload this codebase wants to run on
// exactly one core replica at a time. The catalog is intentionally a
// single function so the wiring is greppable and reviewable in one place.
//
// Add new singletons here; each gets its own lease and goroutine.
func allJobs(clients *shared.ServiceClients) []Job {
	return []Job{
		DoclockExpirySubscriberJob(documentlock.DepsFromServiceClients(clients)),
	}
}

// Start spawns every registered singleton workload and returns an
// aggregate stop function (drains all goroutines on shutdown). This is
// the production entry point — `core/main.go` calls it directly.
//
// Tests that want to register a custom subset can call `StartService`
// instead with the specific jobs they need.
func Start(clients *shared.ServiceClients) (func(), error) {
	return StartService(clients.Redis, allJobs(clients)...)
}
