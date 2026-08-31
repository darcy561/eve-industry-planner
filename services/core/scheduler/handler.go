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
	"eve-industry-planner/core/scheduler/helpers"
)

const otelTracerName = "eve-industry-planner/core"

// TaskScheduler manages static cron jobs and one-time scheduled tasks
type TaskScheduler struct {
	scheduler   gocron.Scheduler
	nats        *eipnats.NATS
	redisClient *redislib.Client
	handlers    map[string]contract.TaskHandler
	consumer    jetstream.Consumer

	// Stop channel for message processing loop
	stopChan chan struct{}
}

// NewTaskScheduler creates a new task scheduler for cron jobs and one-time scheduled tasks
func NewTaskScheduler(natsHandle *eipnats.NATS, redisClient *redislib.Client) (*TaskScheduler, error) {
	// Bound how long Shutdown waits for cancelled jobs to exit (default 10s).
	sched, err := gocron.NewScheduler(gocron.WithStopTimeout(15 * time.Second))
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

// RegisterHandler registers a task handler for a specific task type
func (s *TaskScheduler) RegisterHandler(taskType string, handler contract.TaskHandler) {
	s.handlers[taskType] = handler
}

// HasScheduledJob checks if there's already a scheduled job for the given task type
// For static cron jobs, this always returns true after scheduling
func (s *TaskScheduler) HasScheduledJob(taskType string) bool {
	jobs := s.scheduler.Jobs()
	for _, job := range jobs {
		tags := job.Tags()
		for _, tag := range tags {
			if tag == taskType || tag == "cron:"+taskType {
				return true
			}
		}
	}
	return false
}

// ScheduleCronJob schedules a recurring cron job for a worker task (taskType = task.Name from shared/tasks).
// When the cron fires, the handler for that task runs and publishes to NATS; the worker receives and processes it.
// These cron jobs are not requestable and not persisted.
func (s *TaskScheduler) ScheduleCronJob(cronExpr string, taskType string) error {
	handler, exists := s.handlers[taskType]
	if !exists {
		return nil // Handler not registered yet, will be registered later
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
		consumer, err := helpers.SetupScheduleRunner(s.nats, s.runFiredSchedule, s.stopChan)
		if err != nil {
			return fmt.Errorf("failed to setup schedule runner: %w", err)
		}
		s.consumer = consumer
		logs.DebugCtx(context.Background(), "scheduler started with schedule runner", "component", schedulerLogComponent)
	} else {
		logs.DebugCtx(context.Background(), "scheduler started (no nats handle; deferred runs disabled)", "component", schedulerLogComponent)
	}

	return nil
}

// runFiredSchedule runs the cron job a fired schedule names. The id is the last
// part of the delivery subject, and is the same key the cron registry uses, so a
// deferred run and a scheduled one execute exactly the same handler.
func (s *TaskScheduler) runFiredSchedule(msg jetstream.Msg) {
	ctx, endSpan := eipnats.BeginConsumerContext(
		context.Background(),
		otelTracerName,
		"scheduler.run_fired_schedule",
		msg,
		nil,
	)
	defer endSpan()

	deliveryCount, _ := eipnats.GetMessageMetadata(msg)
	jobName, err := eipnats.ExtractIDFromSubject(msg.Subject(), eipnats.SubjectScheduledPrefix)
	if err != nil {
		eipnats.FinishNATSConsumerOperation(ctx, "warn", "fired schedule rejected", map[string]any{
			"subject": msg.Subject(),
			"reason":  "no job name in subject",
		})
		eipnats.AcknowledgeMessage(ctx, msg, "no job name in subject", deliveryCount)
		return
	}

	handler, exists := s.handlers[jobName]
	if !exists {
		eipnats.FinishNATSConsumerOperation(ctx, "warn", "fired schedule rejected", map[string]any{
			"job":    jobName,
			"reason": "no handler registered",
		})
		eipnats.AcknowledgeMessage(ctx, msg, "no handler registered", deliveryCount)
		return
	}

	if err := handler(ctx, msg.Data()); err != nil {
		logs.ErrorCtx(ctx, "fired schedule failed", "component", schedulerLogComponent, "job", jobName, "error", err)
		eipnats.FinishNATSConsumerOperation(ctx, "warn", "fired schedule failed", map[string]any{
			"job":   jobName,
			"error": err.Error(),
		})
		eipnats.NackMessage(ctx, msg)
		return
	}

	eipnats.AcknowledgeMessage(ctx, msg, "schedule run", deliveryCount)
	eipnats.FinishNATSConsumerOperation(ctx, "info", "fired schedule ran", map[string]any{"job": jobName})
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
