package nats

import (
	"context"
	"time"
)

// Priority queue names for task routing. Use with Publish to override a task's default.
const (
	Priority1 = "priority_1" // Reserved for future critical tasks
	Priority2 = "priority_2" // Urgent, user-impacting
	Priority3 = "priority_3" // Default, steady throughput
	Priority4 = "priority_4" // High-volume background
	Priority5 = "priority_5" // Reserved / bulk tasks (lowest)
)

// Task definitions — single source of truth for name, subject, default priority, and timeout.
var (
	// ApplyOwnerStatisticsDelta folds one owner's uncounted statistics rows into
	// its aggregates. Small and user-facing — the figures a user just archived
	// wait on it — so it outranks the bulk rebuild.
	ApplyOwnerStatisticsDelta = defineTask(Definition{
		Name:            "applyOwnerStatisticsDelta",
		Subject:         "task.scheduled.applyOwnerStatisticsDelta",
		DefaultPriority: Priority3,
		DefaultTimeout:  5 * time.Minute,
	})
	// RebuildOwnerStatistics recomputes one owner's statistics from its archived
	// jobs. Bulk work: a definition change dispatches one of these per owner, and
	// nothing waits on the result.
	RebuildOwnerStatistics = defineTask(Definition{
		Name:            "rebuildOwnerStatistics",
		Subject:         "task.scheduled.rebuildOwnerStatistics",
		DefaultPriority: Priority5,
		DefaultTimeout:  15 * time.Minute,
	})
	// DispatchStatisticsRebuilds reads the statistics queue and publishes one
	// task per owner whose wait is up. It dispatches only, so its timeout covers a
	// queue read and a fan-out rather than any owner's work.
	DispatchStatisticsRebuilds = defineTask(Definition{
		Name:            "dispatchStatisticsRebuilds",
		Subject:         "task.scheduled.dispatchStatisticsRebuilds",
		DefaultPriority: Priority4,
		DefaultTimeout:  15 * time.Minute,
	})
	// ReconcileOwnerStatistics rewrites one owner's aggregates from its stored
	// rows. Bulk work on a rota that nothing waits on, so it ranks with the
	// rebuild it shares a write path with.
	ReconcileOwnerStatistics = defineTask(Definition{
		Name:            "reconcileOwnerStatistics",
		Subject:         "task.scheduled.reconcileOwnerStatistics",
		DefaultPriority: Priority5,
		DefaultTimeout:  15 * time.Minute,
	})
	// DispatchStatisticsReconciles publishes a reconcile for every owner whose
	// turn has come round. Like the drain, it only dispatches.
	DispatchStatisticsReconciles = defineTask(Definition{
		Name:            "dispatchStatisticsReconciles",
		Subject:         "task.scheduled.dispatchStatisticsReconciles",
		DefaultPriority: Priority5,
		DefaultTimeout:  5 * time.Minute,
	})
	RefreshSystemIndexes = defineTask(Definition{
		Name:            "refreshSystemIndexes",
		Subject:         "task.scheduled.refreshSystemIndexes",
		DefaultPriority: Priority3,
		DefaultTimeout:  60 * time.Second,
	})
	RefreshAdjustedPrices = defineTask(Definition{
		Name:            "refreshAdjustedPrices",
		Subject:         "task.scheduled.refreshAdjustedPrices",
		DefaultPriority: Priority3,
		DefaultTimeout:  60 * time.Second,
	})
	RefreshRegionMarketOrders = defineTask(Definition{
		Name:            "refreshRegionMarketOrders",
		Subject:         "task.scheduled.refreshRegionMarketOrders",
		DefaultPriority: Priority4,
		DefaultTimeout:  30 * time.Minute,
	})
	UpdateAccountSessionGrants = defineTask(Definition{
		Name:            "updateAccountSessionGrants",
		Subject:         "task.auth.updateAccountSessionGrants",
		DefaultPriority: Priority3,
		DefaultTimeout:  60 * time.Second,
	})
	CheckSDEUpdates = defineTask(Definition{
		Name:            "checkSDEUpdates",
		Subject:         "task.scheduled.checkSDEUpdates",
		DefaultPriority: Priority5,
		DefaultTimeout:  15 * time.Minute,
	})
	RollbackSDEVersion = defineTask(Definition{
		Name:            "rollbackSDEVersion",
		Subject:         "task.scheduled.rollbackSDEVersion",
		DefaultPriority: Priority5,
		DefaultTimeout:  15 * time.Minute,
	})
	ApplySDEVersion = defineTask(Definition{
		Name:            "applySDEVersion",
		Subject:         "task.scheduled.applySDEVersion",
		DefaultPriority: Priority5,
		DefaultTimeout:  15 * time.Minute,
	})
	RebuildCurrentSDEVersion = defineTask(Definition{
		Name:            "rebuildCurrentSDEVersion",
		Subject:         "task.scheduled.rebuildCurrentSDEVersion",
		DefaultPriority: Priority5,
		DefaultTimeout:  15 * time.Minute,
	})
	RotateRefreshTokenKeys = defineTask(Definition{
		Name:            "rotateRefreshTokenKeys",
		Subject:         "task.maintenance.rotateRefreshTokenKeys",
		DefaultPriority: Priority5,
		DefaultTimeout:  20 * time.Minute,
	})

	// EncodeJobIdentity converts the entity ids one account's job documents still
	// hold in the clear into refs, and brings documents written under an older
	// field set onto the current one.
	EncodeJobIdentity = defineTask(Definition{
		Name:            "encodeJobIdentity",
		Subject:         "task.maintenance.encodeJobIdentity",
		DefaultPriority: Priority5,
		DefaultTimeout:  20 * time.Minute,
	})
	SchemaVersionMaintenanceBatch = defineTask(Definition{
		Name:            "schemaVersionMaintenanceBatch",
		Subject:         "task.maintenance.schemaVersionMaintenanceBatch",
		DefaultPriority: Priority5,
		DefaultTimeout:  3 * time.Minute,
	})
	InactiveAccountPlannerCleanup = defineTask(Definition{
		Name:            "inactiveAccountPlannerCleanup",
		Subject:         "task.maintenance.inactiveAccountPlannerCleanup",
		DefaultPriority: Priority5,
		DefaultTimeout:  5 * time.Minute,
	})
	CloudStoredEsiRefreshMaintenance = defineTask(Definition{
		Name:            "cloudStoredEsiRefreshMaintenance",
		Subject:         "task.maintenance.cloudStoredEsiRefreshMaintenance",
		DefaultPriority: Priority5,
		DefaultTimeout:  10 * time.Minute,
	})
	PruneExpiredAccountSessions = defineTask(Definition{
		Name:            "pruneExpiredAccountSessions",
		Subject:         "task.maintenance.pruneExpiredAccountSessions",
		DefaultPriority: Priority5,
		DefaultTimeout:  5 * time.Minute,
	})
)

// Publish helpers. One per task, taking the fields that task needs, so a caller
// names what it is asking for rather than assembling a payload first. A zero
// value means the worker's default, exactly as the omitted JSON field does.

// PublishDispatchStatisticsRebuilds asks the worker to dispatch a rebuild for
// every owner waiting in the queue.
func PublishDispatchStatisticsRebuilds(ctx context.Context, n *NATS, req DrainRebuildQueueRequest) error {
	return publish(ctx, n, DispatchStatisticsRebuilds, req)
}

// DrainRebuildQueueRequest carries whether the debounce applies to this pass.
//
// The scheduled pass leaves it false: the debounce bounds how often an owner is
// rebuilt while the system serves traffic. An operator running the drain by hand
// is not that case — they are usually inside a maintenance window waiting on the
// queue — so the command sets it and every waiting owner goes at once.
type DrainRebuildQueueRequest struct {
	IgnoreDebounce bool `json:"ignoreDebounce,omitempty"`
}

// PublishApplyOwnerStatisticsDelta asks the worker to fold one owner's uncounted
// rows into its aggregates.
func PublishApplyOwnerStatisticsDelta(ctx context.Context, n *NATS, kind, id string, claim int64) error {
	return publish(ctx, n, ApplyOwnerStatisticsDelta, RebuildOwnerStatisticsRequest{
		OwnerKind: kind,
		OwnerID:   id,
		Claim:     claim,
	})
}

// PublishRebuildOwnerStatistics asks the worker to rebuild one owner.
func PublishRebuildOwnerStatistics(ctx context.Context, n *NATS, kind, id string, claim int64) error {
	return publish(ctx, n, RebuildOwnerStatistics, RebuildOwnerStatisticsRequest{
		OwnerKind: kind,
		OwnerID:   id,
		Claim:     claim,
	})
}

// PublishDispatchStatisticsReconciles asks the worker to dispatch a reconcile
// for every owner whose turn has come round.
func PublishDispatchStatisticsReconciles(ctx context.Context, n *NATS) error {
	return publish(ctx, n, DispatchStatisticsReconciles, struct{}{})
}

// PublishReconcileOwnerStatistics asks the worker to rewrite one owner's
// aggregates from its rows.
func PublishReconcileOwnerStatistics(ctx context.Context, n *NATS, kind, id string) error {
	return publish(ctx, n, ReconcileOwnerStatistics, ReconcileOwnerStatisticsRequest{
		OwnerKind: kind,
		OwnerID:   id,
	})
}

// TriggerRefreshSystemIndexes asks the worker to refresh industry system indexes.
func TriggerRefreshSystemIndexes(ctx context.Context, n *NATS) error {
	return trigger(ctx, n, RefreshSystemIndexes)
}

// TriggerRefreshAdjustedPrices asks the worker to refresh adjusted prices.
func TriggerRefreshAdjustedPrices(ctx context.Context, n *NATS) error {
	return trigger(ctx, n, RefreshAdjustedPrices)
}

// PublishRefreshRegionMarketOrders asks the worker to refresh one region's order book.
func PublishRefreshRegionMarketOrders(ctx context.Context, n *NATS, regionID int32, stationID int64) error {
	return publish(ctx, n, RefreshRegionMarketOrders, RegionMarketOrdersRequest{RegionID: regionID, StationID: stationID})
}

// PublishUpdateAccountSessionGrants resolves corporation and alliance grants from EVE SSO tokens.
func PublishUpdateAccountSessionGrants(ctx context.Context, n *NATS, accountID string, tokens []string) error {
	return publish(ctx, n, UpdateAccountSessionGrants, AccountSessionGrantsRequest{AccountID: accountID, Tokens: tokens})
}

// TriggerCheckSDEUpdates asks the worker to check for a new Static Data Export.
func TriggerCheckSDEUpdates(ctx context.Context, n *NATS) error {
	return trigger(ctx, n, CheckSDEUpdates)
}

// PublishRotateRefreshTokenKeys re-encrypts one account's refresh tokens onto the current key.
func PublishRotateRefreshTokenKeys(ctx context.Context, n *NATS, accountID, fromVersion string, dryRun bool) error {
	return publish(ctx, n, RotateRefreshTokenKeys, RotateRefreshTokenKeysRequest{
		AccountID:   accountID,
		FromVersion: fromVersion,
		DryRun:      dryRun,
	})
}

// PublishEncodeJobIdentity converts one account's entity ids to refs in a collection.
func PublishEncodeJobIdentity(ctx context.Context, n *NATS, accountID, collection string, dryRun bool) error {
	return publish(ctx, n, EncodeJobIdentity, EncodeJobIdentityRequest{
		AccountID:  accountID,
		Collection: collection,
		DryRun:     dryRun,
	})
}

// PublishSchemaVersionMaintenanceBatch upgrades one batch of documents in a collection.
func PublishSchemaVersionMaintenanceBatch(ctx context.Context, n *NATS, collection string, batchSize int) error {
	return publish(ctx, n, SchemaVersionMaintenanceBatch, SchemaVersionMaintenanceBatchRequest{
		Collection: collection,
		BatchSize:  batchSize,
	})
}

// PublishInactiveAccountPlannerCleanup removes planner jobs and groups for one inactive account.
func PublishInactiveAccountPlannerCleanup(ctx context.Context, n *NATS, accountID string, staleAgeYears int) error {
	return publish(ctx, n, InactiveAccountPlannerCleanup, InactiveAccountPlannerCleanupRequest{
		AccountID:     accountID,
		StaleAgeYears: staleAgeYears,
	})
}

// PublishCloudStoredEsiRefreshMaintenance rotates one account's stored ESI refresh tokens.
func PublishCloudStoredEsiRefreshMaintenance(ctx context.Context, n *NATS, accountID string, rotateAfterLoginDays, abandonAfterLoginMonths int) error {
	return publish(ctx, n, CloudStoredEsiRefreshMaintenance, CloudStoredEsiRefreshMaintenanceRequest{
		AccountID:               accountID,
		RotateAfterLoginDays:    rotateAfterLoginDays,
		AbandonAfterLoginMonths: abandonAfterLoginMonths,
	})
}

// TriggerPruneExpiredAccountSessions asks the worker to prune expired account sessions.
func TriggerPruneExpiredAccountSessions(ctx context.Context, n *NATS) error {
	return trigger(ctx, n, PruneExpiredAccountSessions)
}

// TriggerRollbackSDEVersion rolls the live Static Data Export back to the most
// recent previous build. Which build that is comes from the store, not from the
// caller, so there is nothing to send.
func TriggerRollbackSDEVersion(ctx context.Context, n *NATS) error {
	return trigger(ctx, n, RollbackSDEVersion)
}

// PublishApplySDEVersion builds and locks the live Static Data Export to a build.
func PublishApplySDEVersion(ctx context.Context, n *NATS, buildNumber int) error {
	return publish(ctx, n, ApplySDEVersion, SDEApplyVersionRequest{BuildNumber: buildNumber})
}

// TriggerRebuildCurrentSDEVersion rebuilds the Static Data Export already locked
// in. The build to rebuild is the one the store says is current.
func TriggerRebuildCurrentSDEVersion(ctx context.Context, n *NATS) error {
	return trigger(ctx, n, RebuildCurrentSDEVersion)
}

// Definition is what a task is: the handler key, the subject it travels on, and
// the queue and deadline the worker gives it. The worker resolves the last two
// by name at runtime, which is why definitions are values rather than only the
// publish helpers below.
type Definition struct {
	Name            string
	Subject         string
	DefaultPriority string
	DefaultTimeout  time.Duration
}

var (
	taskRegistry          = map[string]Definition{}
	taskRegistryBySubject = map[string]Definition{}
)

// defineTask registers a task and returns it.
func defineTask(d Definition) Definition {
	if d.Name == "" || d.Subject == "" {
		panic("nats: task name and subject are required")
	}
	if _, exists := taskRegistry[d.Name]; exists {
		panic("nats: duplicate task name " + d.Name)
	}
	if _, exists := taskRegistryBySubject[d.Subject]; exists {
		panic("nats: duplicate task subject " + d.Subject)
	}
	taskRegistry[d.Name] = d
	taskRegistryBySubject[d.Subject] = d
	return d
}

// LookupTask returns the definition registered under name.
func LookupTask(name string) (Definition, bool) {
	d, ok := taskRegistry[name]
	return d, ok
}

// TaskBySubject returns the task a subject names.
//
// The subject is a task's identity on the wire, so resolving it is a lookup
// rather than a parse: a subject no definition claims names no task, and the
// worker can say so instead of inventing a name from the last segment and
// running it on whatever queue the defaults suggest.
func TaskBySubject(subject string) (Definition, bool) {
	d, ok := taskRegistryBySubject[subject]
	return d, ok
}

// Tasks returns every registered definition, for callers that must cover the set.
func Tasks() []Definition {
	out := make([]Definition, 0, len(taskRegistry))
	for _, d := range taskRegistry {
		out = append(out, d)
	}
	return out
}

// publish sends a payload on a task's subject. The queue it runs on is the
// task's own, recorded in its definition and resolved by the worker.
func publish(ctx context.Context, n *NATS, d Definition, payload any) error {
	return n.PublishTask(ctx, d.Subject, d.Name, payload)
}

// trigger fires a task that carries no payload.
func trigger(ctx context.Context, n *NATS, d Definition) error {
	return n.PublishEmpty(ctx, d.Subject)
}
