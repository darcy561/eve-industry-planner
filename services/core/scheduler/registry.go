package scheduler

import (
	"context"

	"eve-industry-planner/core/scheduler/archivedjobs"
	"eve-industry-planner/core/scheduler/contract"
	"eve-industry-planner/core/scheduler/esi"
	"eve-industry-planner/core/scheduler/maintenance"
	"eve-industry-planner/core/scheduler/sde"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"

	natslib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	redislib "github.com/redis/go-redis/v9"
	mongodriver "go.mongodb.org/mongo-driver/mongo"
)

const schedulerLogComponent = "scheduler"

// SchedulerFunc represents a function that sets up a scheduled job.
// Accepts a Dependencies struct containing all available dependencies and a Scheduler interface.
// Returns a cleanup function and an error if scheduling fails.
type SchedulerFunc func(contract.Dependencies, contract.Scheduler) (func(), error)

// JobRegistry manages all scheduled jobs
type JobRegistry struct {
	cleanups         []func()
	schedulers       []SchedulerFunc
	schedulerHandler *TaskScheduler
}

// NewJobRegistry creates a new job registry
func NewJobRegistry() *JobRegistry {
	return &JobRegistry{
		cleanups:   []func(){},
		schedulers: []SchedulerFunc{},
	}
}

// Register adds a scheduler function to the registry
func (r *JobRegistry) Register(scheduler SchedulerFunc) {
	r.schedulers = append(r.schedulers, scheduler)
}

// Start registers all schedulers
func (r *JobRegistry) Start(natsConn *natslib.Conn, jsContext jetstream.JetStream, redisClient *redislib.Client, mongoClient *mongodriver.Client) error {
	// Ensure required JetStream streams exist before starting schedulers
	if err := natscore.EnsureWorkerTaskStream(jsContext); err != nil {
		return err
	}

	// Create the task scheduler
	var err error
	r.schedulerHandler, err = NewTaskScheduler(jsContext, redisClient, natsConn)
	if err != nil {
		return err
	}

	deps := contract.Dependencies{
		NATS:      natsConn,
		JSContext: jsContext,
		Redis:     redisClient,
		Mongo:     mongoClient,
	}

	bg := context.Background()
	// Register handlers and schedule crons (each scheduler func registers its handler and calls ScheduleCronJob)
	for _, schedulerFunc := range r.schedulers {
		cleanup, err := schedulerFunc(deps, r.schedulerHandler)
		if err != nil {
			logs.ErrorCtx(bg, "failed to register scheduler", "component", schedulerLogComponent, "error", err)
			// Continue with other schedulers even if one fails
			continue
		}
		r.cleanups = append(r.cleanups, cleanup)
	}

	// Restore one-time jobs from Redis (after handlers are registered)
	if err := r.schedulerHandler.RestoreOneTimeJobs(); err != nil {
		logs.WarnCtx(bg, "failed to restore one-time jobs from Redis", "component", schedulerLogComponent, "error", err)
	}

	// Start the scheduler after all handlers are registered, cron jobs are scheduled, and one-time jobs are restored
	if err := r.schedulerHandler.Start(); err != nil {
		return err
	}

	logs.DebugCtx(bg, "job registry started", "component", schedulerLogComponent, "schedulers", len(r.cleanups))
	return nil
}

// Stop stops all schedulers and cleans up
func (r *JobRegistry) Stop() {
	// Note: cleanup functions are now used for startup checks, not cleanup
	// There's nothing to clean up here since startup checks were already run
	if r.schedulerHandler != nil {
		r.schedulerHandler.Stop()
	}
	logs.InfoCtx(context.Background(), "job registry stopped", "component", schedulerLogComponent)
}

// StartService starts the scheduler service with all registered schedulers.
// Returns a stop function for graceful shutdown, plus an error if startup fails.
func StartService(logComponent string, natsConn *natslib.Conn, jsContext jetstream.JetStream, redisClient *redislib.Client, mongoClient *mongodriver.Client) (func(), error) {
	_ = logComponent // legacy parameter; component is embedded in log lines
	stop := make(chan struct{})

	// Create job registry to manage all schedulers
	registry := NewJobRegistry()

	// Register all schedulers
	registry.Register(esi.ScheduleIndustrySystemsRefresh)
	registry.Register(esi.ScheduleAdjustedPricesRefresh)
	registry.Register(esi.ScheduleMarketPricesRefresh)
	registry.Register(esi.ScheduleMarketPricesCount)
	registry.Register(sde.ScheduleCheckSDEUpdates)
	registry.Register(archivedjobs.ScheduleArchivedJobsStats)
	registry.Register(maintenance.ScheduleSchemaVersionMaintenance)
	registry.Register(maintenance.ScheduleInactiveAccountPlannerCleanup)
	registry.Register(maintenance.ScheduleCloudStoredEsiRefreshMaintenance)
	registry.Register(maintenance.SchedulePruneExpiredAccountSessions)
	// Add more schedulers here:
	// registry.Register(market.ScheduleMarketHistoryRefresh)

	// Start all registered schedulers
	if err := registry.Start(natsConn, jsContext, redisClient, mongoClient); err != nil {
		logs.ErrorCtx(context.Background(), "failed to start job registry", "component", schedulerLogComponent, "error", err)
		registry.Stop()
		close(stop)
		return nil, err
	}

	return func() {
		registry.Stop()
		close(stop)
	}, nil
}
