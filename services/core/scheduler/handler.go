package scheduler

import (
	"context"
	"fmt"
	"time"

	"github.com/go-co-op/gocron/v2"
	"github.com/nats-io/nats.go/jetstream"
	redislib "github.com/redis/go-redis/v9"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"

	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"

	"eve-industry-planner/core/scheduler/contract"
)

const otelTracerName = "eve-industry-planner/core"

// TaskScheduler manages static cron jobs and one-time scheduled tasks
type TaskScheduler struct {
	scheduler   gocron.Scheduler
	nats        *eipnats.NATS
	redisClient *redislib.Client
	handlers    map[string]contract.TaskHandler

	// Stop channel for message processing loop
	stopChan chan struct{}
}

// NewTaskScheduler creates a new task scheduler for cron jobs and one-time scheduled tasks
func NewTaskScheduler(natsHandle *eipnats.NATS, redisClient *redislib.Client) (*TaskScheduler, error) {
	// Bound how long Shutdown waits for cancelled jobs to exit (default 10s).
	// Expressions are read in UTC, so a declared time means the same thing wherever
	// the container runs and matches the EVE downtime window jobs compare against.
	sched, err := gocron.NewScheduler(
		gocron.WithStopTimeout(15*time.Second),
		gocron.WithLocation(time.UTC),
	)
	if err != nil {
		return nil, err
	}

	return &TaskScheduler{
		scheduler:   sched,
		nats:        natsHandle,
		redisClient: redisClient,
		handlers:    make(map[string]contract.TaskHandler),
		stopChan:    make(chan struct{}),
	}, nil
}

// registerHandler registers a task handler for a specific task type
func (s *TaskScheduler) registerHandler(taskType string, handler contract.TaskHandler) {
	s.handlers[taskType] = handler
}

// scheduleCronJob schedules a declared job under its own name. When the cron fires,
// that job's handler runs and publishes to NATS; the worker receives and processes it.
func (s *TaskScheduler) scheduleCronJob(cronExpr string, taskType string) error {
	handler, exists := s.handlers[taskType]
	if !exists {
		return fmt.Errorf("no handler registered for %s", taskType)
	}

	// First arg must be context.Context so gocron cancels in-flight work on Shutdown
	// (market-prices micro-batches etc. must stop when primary is lost).
	jobFunc := func(jobCtx context.Context) {
		startTime := time.Now()
		jobID := fmt.Sprintf("cron-%s-%d", taskType, startTime.UnixNano())
		logs.DebugCtx(jobCtx, "cron job triggered", "component", schedulerLogComponent,
			"job_id", jobID, "task_type", taskType, "cron_expr", cronExpr)

		tracer := otel.Tracer(otelTracerName)
		ctx, span := tracer.Start(jobCtx, "scheduler.run",
			trace.WithSpanKind(trace.SpanKindProducer),
			trace.WithAttributes(
				attribute.String("scheduler.trigger", "cron"),
				attribute.String("scheduler.task_type", taskType),
				attribute.String("scheduler.job_id", jobID),
				attribute.String("scheduler.cron_expr", cronExpr),
			),
		)
		defer span.End()

		if err := handler(ctx, nil); err != nil {
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())
			logs.ErrorCtx(ctx, "cron job handler failed", "component", schedulerLogComponent,
				"job_id", jobID, "task_type", taskType, "error", err, "duration_ms", time.Since(startTime).Milliseconds())
		} else {
			span.SetStatus(codes.Ok, "")
			logs.DebugCtx(ctx, "cron job handler completed", "component", schedulerLogComponent,
				"job_id", jobID, "task_type", taskType, "duration_ms", time.Since(startTime).Milliseconds())
		}
	}

	_, err := s.scheduler.NewJob(
		gocron.CronJob(cronExpr, false),
		gocron.NewTask(jobFunc),
		gocron.WithTags("cron:"+taskType), // Tag with "cron:" prefix to distinguish from one-time jobs
	)
	if err != nil {
		return err
	}

	logs.DebugCtx(context.Background(), "cron job scheduled", "component", schedulerLogComponent,
		"task_type", taskType, "cron", cronExpr)
	return nil
}

// Start begins listening for scheduling requests and starts the scheduler
func (s *TaskScheduler) Start() error {
	// Start the gocron scheduler
	s.scheduler.Start()

	// Deferred runs arrive as schedules firing on the schedule stream.
	if s.nats != nil {
		if _, err := s.nats.Schedules.Reconcile(context.Background(), eipnats.ConsumerScheduleRunner); err != nil {
			logs.WarnCtx(context.Background(), "schedule stream consumer reconcile failed", "component", schedulerLogComponent, "error", err)
		}

		filter := eipnats.SubjectScheduledPrefix + ".>"
		_, err := s.nats.Schedules.Subscribe(context.Background(), jetstream.ConsumerConfig{
			Durable:       eipnats.ConsumerScheduleRunner,
			FilterSubject: filter,
			DeliverPolicy: jetstream.DeliverAllPolicy,
			AckPolicy:     jetstream.AckExplicitPolicy,
			AckWait:       30 * time.Second,
			MaxDeliver:    5,
		}, eipnats.Handle(otelTracerName, "scheduler.run_fired_schedule", s.runFiredSchedule),
			eipnats.WithStopChannel(s.stopChan))
		if err != nil {
			return fmt.Errorf("failed to setup schedule runner: %w", err)
		}
		logs.DebugCtx(context.Background(), "scheduler started with schedule runner", "component", schedulerLogComponent)
	} else {
		logs.DebugCtx(context.Background(), "scheduler started (no nats handle; deferred runs disabled)", "component", schedulerLogComponent)
	}

	return nil
}

// runFiredSchedule runs the cron job a fired schedule names. The id is the last
// part of the delivery subject, and is the same key the cron registry uses, so a
// deferred run and a scheduled one execute exactly the same handler.
func (s *TaskScheduler) runFiredSchedule(ctx context.Context, msg jetstream.Msg) error {
	jobName, err := eipnats.ExtractIDFromSubject(msg.Subject(), eipnats.SubjectScheduledPrefix)
	if err != nil {
		return eipnats.Terminate("no job name in subject %s", msg.Subject())
	}
	handler, exists := s.handlers[jobName]
	if !exists {
		return eipnats.Terminate("no handler registered for %s", jobName)
	}
	if err := handler(ctx, msg.Data()); err != nil {
		return fmt.Errorf("run %s: %w", jobName, err)
	}
	logs.InfoCtx(ctx, "fired schedule ran", "component", schedulerLogComponent, "job", jobName)
	return nil
}

// Stop stops listening for scheduling requests and stops the scheduler
func (s *TaskScheduler) Stop() {
	bg := context.Background()
	// Stop the message processing loop
	if s.stopChan != nil {
		close(s.stopChan)
	}

	// Stop the gocron scheduler
	if err := s.scheduler.Shutdown(); err != nil {
		logs.WarnCtx(bg, "error shutting down scheduler", "component", schedulerLogComponent, "error", err)
	}

	logs.InfoCtx(bg, "scheduler stopped", "component", schedulerLogComponent)
}
