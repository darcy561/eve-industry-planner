package scheduler

import (
	"context"
	"fmt"

	"eve-industry-planner/core/scheduler/contract"
	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"

	"eve-industry-planner/shared/esiclient"
	eipmongo "eve-industry-planner/shared/mongo"
	redislib "github.com/redis/go-redis/v9"
)

const schedulerLogComponent = "scheduler"

// JobRegistry runs the declared jobs under one TaskScheduler.
type JobRegistry struct {
	schedulerHandler *TaskScheduler
}

// NewJobRegistry creates a new job registry
func NewJobRegistry() *JobRegistry {
	return &JobRegistry{}
}

// Start registers every declared job's handler and schedules it.
func (r *JobRegistry) Start(natsHandle *eipnats.NATS, redisClient *redislib.Client, mongoHandle *eipmongo.Mongo, esi esiclient.API) error {
	bg := context.Background()

	// Ensure required JetStream streams exist before starting schedulers
	if _, err := natsHandle.Tasks.Ensure(bg); err != nil {
		return err
	}

	var err error
	r.schedulerHandler, err = NewTaskScheduler(natsHandle, redisClient)
	if err != nil {
		return err
	}

	deps := contract.Dependencies{
		NATS:  natsHandle,
		Redis: redisClient,
		Mongo: mongoHandle,
		ESI:   esi,
	}

	for _, job := range jobs {
		r.schedulerHandler.registerHandler(job.Name, job.Build(deps, job.Name))
		if err := r.schedulerHandler.scheduleCronJob(job.Expr, job.Name); err != nil {
			return fmt.Errorf("schedule %s: %w", job.Name, err)
		}
	}

	if err := r.schedulerHandler.Start(); err != nil {
		return err
	}

	logs.DebugCtx(bg, "job registry started", "component", schedulerLogComponent, "jobs", len(jobs))
	return nil
}

// Stop stops the scheduler.
func (r *JobRegistry) Stop() {
	if r.schedulerHandler != nil {
		r.schedulerHandler.Stop()
	}
	logs.InfoCtx(context.Background(), "job registry stopped", "component", schedulerLogComponent)
}

// StartService starts the scheduler service with all registered schedulers.
// Returns a stop function for graceful shutdown, plus an error if startup fails.
func StartService(logComponent string, natsHandle *eipnats.NATS, redisClient *redislib.Client, mongoHandle *eipmongo.Mongo) (func(), error) {
	_ = logComponent // legacy parameter; component is embedded in log lines
	stop := make(chan struct{})

	// The scheduler asks the limiter what it knows — whether the servers are
	// answering, and what a run would cost — but makes no requests of its own.
	esi, stopESI, err := esiclient.New(redisClient, esiclient.DefaultConfig())
	if err != nil {
		close(stop)
		return nil, fmt.Errorf("build esi client: %w", err)
	}

	registry := NewJobRegistry()

	if err := registry.Start(natsHandle, redisClient, mongoHandle, esi); err != nil {
		logs.ErrorCtx(context.Background(), "failed to start job registry", "component", schedulerLogComponent, "error", err)
		registry.Stop()
		stopESI()
		close(stop)
		return nil, err
	}

	return func() {
		registry.Stop()
		stopESI()
		close(stop)
	}, nil
}
