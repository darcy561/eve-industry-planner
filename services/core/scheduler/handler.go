package scheduler

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/go-co-op/gocron/v2"
	natslib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	redislib "github.com/redis/go-redis/v9"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry/natsprop"

	"eve-industry-planner/core/scheduler/contract"
	"eve-industry-planner/core/scheduler/helpers"
)

const otelTracerName = "eve-industry-planner/core"

// Requestable task types - tasks that can be scheduled via message requests
var requestableTaskTypes = map[string]bool{
	// ESI refresh tasks - can be rescheduled when rate limited
	"refreshSystemIndexes":  true,
	"refreshAdjustedPrices": true,
	"refreshMarketPrices":   true,
}

// OneTimeJob represents a one-time scheduled job
type OneTimeJob struct {
	JobID    string          `json:"job_id"`
	TaskType string          `json:"task_type"`
	RunAt    int64           `json:"run_at"` // Unix timestamp in milliseconds
	Data     json.RawMessage `json:"data,omitempty"`
}

// TaskScheduler manages static cron jobs and one-time scheduled tasks
type TaskScheduler struct {
	scheduler   gocron.Scheduler
	jsContext   jetstream.JetStream
	redisClient *redislib.Client
	natsConn    *natslib.Conn
	handlers    map[string]contract.TaskHandler
	consumer    jetstream.Consumer

	// Track one-time jobs by job ID for easy removal
	oneTimeJobs map[string]gocron.Job

	// Stop channel for message processing loop
	stopChan chan struct{}
}

// NewTaskScheduler creates a new task scheduler for cron jobs and one-time scheduled tasks
func NewTaskScheduler(jsContext jetstream.JetStream, redisClient *redislib.Client, natsConn *natslib.Conn) (*TaskScheduler, error) {
	sched, err := gocron.NewScheduler()
	if err != nil {
		return nil, err
	}

	return &TaskScheduler{
		scheduler:   sched,
		jsContext:   jsContext,
		redisClient: redisClient,
		natsConn:    natsConn,
		handlers:    make(map[string]contract.TaskHandler),
		oneTimeJobs: make(map[string]gocron.Job),
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

	jobFunc := func() {
		startTime := time.Now()
		jobID := fmt.Sprintf("cron-%s-%d", taskType, startTime.UnixNano())
		bg := context.Background()
		logs.DebugCtx(bg, "cron job triggered", "component", schedulerLogComponent,
			"job_id", jobID, "task_type", taskType, "cron_expr", cronExpr)

		tracer := otel.Tracer(otelTracerName)
		ctx, span := tracer.Start(bg, "scheduler.run",
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

// ScheduleOneTimeJob schedules a one-time job to run at the specified time
func (s *TaskScheduler) ScheduleOneTimeJob(jobID string, taskType string, runAt time.Time, data json.RawMessage) error {
	// Check if task type is requestable
	if !requestableTaskTypes[taskType] {
		return fmt.Errorf("task type %s is not requestable", taskType)
	}

	// Check if handler exists
	handler, exists := s.handlers[taskType]
	if !exists {
		return fmt.Errorf("no handler registered for task type: %s", taskType)
	}

	now := time.Now()
	if !runAt.After(now) {
		// If run_at is in the past, schedule for soon
		logs.InfoCtx(context.Background(), "run_at is in the past, scheduling soon", "component", schedulerLogComponent,
			"job_id", jobID, "task_type", taskType, "run_at", runAt.Format(time.RFC3339))
		runAt = now.Add(5 * time.Second)
	}

	duration := time.Until(runAt)
	if duration < 0 {
		duration = 5 * time.Second
	}

	// Capture variables for the job callback
	jobIDCopy := jobID
	taskTypeCopy := taskType
	taskDataCopy := data

	// Create the job function
	jobFunc := func() {
		startTime := time.Now()
		bg := context.Background()
		tracer := otel.Tracer(otelTracerName)
		ctx, span := tracer.Start(bg, "scheduler.run",
			trace.WithSpanKind(trace.SpanKindProducer),
			trace.WithAttributes(
				attribute.String("scheduler.trigger", "onetime"),
				attribute.String("scheduler.task_type", taskTypeCopy),
				attribute.String("scheduler.job_id", jobIDCopy),
			),
		)
		defer span.End()

		logs.InfoCtx(ctx, "one-time job started", "component", schedulerLogComponent,
			"job_id", jobIDCopy, "task_type", taskTypeCopy)

		if err := handler(ctx, taskDataCopy); err != nil {
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())
			logs.ErrorCtx(ctx, "one-time job failed", "component", schedulerLogComponent,
				"job_id", jobIDCopy, "task_type", taskTypeCopy, "error", err, "duration_ms", time.Since(startTime).Milliseconds())
		} else {
			span.SetStatus(codes.Ok, "")
			logs.InfoCtx(ctx, "one-time job completed", "component", schedulerLogComponent,
				"job_id", jobIDCopy, "task_type", taskTypeCopy, "duration_ms", time.Since(startTime).Milliseconds())
		}

		// Remove job from scheduler and Redis after execution
		s.removeOneTimeJob(jobIDCopy)
	}

	// Schedule the job using gocron
	job, err := s.scheduler.NewJob(
		gocron.DurationJob(duration),
		gocron.NewTask(jobFunc),
		gocron.WithTags("onetime:"+jobIDCopy, "task:"+taskTypeCopy),
	)
	if err != nil {
		return fmt.Errorf("failed to schedule one-time job: %w", err)
	}

	// Track the job
	s.oneTimeJobs[jobIDCopy] = job

	// Persist to Redis
	redisCtx := context.Background()
	if s.redisClient != nil {
		oneTimeJob := OneTimeJob{
			JobID:    jobIDCopy,
			TaskType: taskTypeCopy,
			RunAt:    runAt.UnixMilli(),
			Data:     taskDataCopy,
		}
		if err := s.saveOneTimeJobToRedis(redisCtx, oneTimeJob); err != nil {
			logs.WarnCtx(redisCtx, "failed to persist one-time job to Redis", "component", schedulerLogComponent,
				"job_id", jobIDCopy, "error", err)
		}
	}

	logs.InfoCtx(context.Background(), "one-time job scheduled", "component", schedulerLogComponent,
		"job_id", jobIDCopy, "task_type", taskTypeCopy, "run_at", runAt.Format(time.RFC3339))
	return nil
}

// removeOneTimeJob removes a one-time job from the scheduler and Redis
func (s *TaskScheduler) removeOneTimeJob(jobID string) {
	bg := context.Background()
	// Remove from scheduler
	if job, exists := s.oneTimeJobs[jobID]; exists {
		if err := s.scheduler.RemoveJob(job.ID()); err != nil {
			logs.WarnCtx(bg, "failed to remove one-time job from scheduler", "component", schedulerLogComponent,
				"job_id", jobID, "error", err)
		}
		delete(s.oneTimeJobs, jobID)
	}

	// Remove from Redis
	if s.redisClient != nil {
		ctx := context.Background()
		key := s.oneTimeJobKey(jobID)
		if err := s.redisClient.Del(ctx, key).Err(); err != nil {
			logs.WarnCtx(bg, "failed to remove one-time job from Redis", "component", schedulerLogComponent,
				"job_id", jobID, "error", err)
		}
	}
}

// saveOneTimeJobToRedis persists a one-time job to Redis
func (s *TaskScheduler) saveOneTimeJobToRedis(ctx context.Context, job OneTimeJob) error {
	key := s.oneTimeJobKey(job.JobID)
	data, err := json.Marshal(job)
	if err != nil {
		return err
	}
	// No TTL - jobs persist until executed or removed
	return s.redisClient.Set(ctx, key, data, 0).Err()
}

// oneTimeJobKey returns the Redis key for a one-time job
func (s *TaskScheduler) oneTimeJobKey(jobID string) string {
	return fmt.Sprintf("scheduler:onetime:%s", jobID)
}

// generateJobID generates a unique job ID
func (s *TaskScheduler) generateJobID() (string, error) {
	randomBytes := make([]byte, 8)
	if _, err := rand.Read(randomBytes); err != nil {
		return "", err
	}
	return fmt.Sprintf("%d-%s", time.Now().UnixNano(), hex.EncodeToString(randomBytes)), nil
}

// RestoreOneTimeJobs restores persisted one-time jobs from Redis
func (s *TaskScheduler) RestoreOneTimeJobs() error {
	if s.redisClient == nil {
		return nil
	}

	ctx := context.Background()
	pattern := "scheduler:onetime:*"
	var keys []string
	var cursor uint64

	// Scan for all one-time job keys
	for {
		var scanKeys []string
		var err error
		scanKeys, cursor, err = s.redisClient.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			return err
		}
		keys = append(keys, scanKeys...)
		if cursor == 0 {
			break
		}
	}

	now := time.Now()
	restored := 0
	discarded := 0

	// Load all jobs from Redis
	for _, key := range keys {
		data, err := s.redisClient.Get(ctx, key).Result()
		if err != nil {
			logs.WarnCtx(ctx, "failed to read one-time job from Redis", "component", schedulerLogComponent,
				"key", key, "error", err)
			continue
		}

		var job OneTimeJob
		if err := json.Unmarshal([]byte(data), &job); err != nil {
			logs.WarnCtx(ctx, "failed to unmarshal one-time job from Redis", "component", schedulerLogComponent,
				"key", key, "error", err)
			_ = s.redisClient.Del(ctx, key).Err()
			discarded++
			continue
		}

		// Check if job is in the past
		runAt := time.Unix(0, job.RunAt*int64(time.Millisecond))
		if !runAt.After(now) {
			logs.InfoCtx(ctx, "discarding one-time job (in the past)", "component", schedulerLogComponent,
				"job_id", job.JobID, "task_type", job.TaskType, "run_at", runAt.Format(time.RFC3339))
			_ = s.redisClient.Del(ctx, key).Err()
			discarded++
			continue
		}

		// Check if handler exists for this task type
		_, exists := s.handlers[job.TaskType]
		if !exists {
			logs.WarnCtx(ctx, "no handler for restored one-time job, discarding", "component", schedulerLogComponent,
				"job_id", job.JobID, "task_type", job.TaskType)
			_ = s.redisClient.Del(ctx, key).Err()
			discarded++
			continue
		}

		// Check if task type is requestable
		if !requestableTaskTypes[job.TaskType] {
			logs.WarnCtx(ctx, "task type is not requestable, discarding", "component", schedulerLogComponent,
				"job_id", job.JobID, "task_type", job.TaskType)
			_ = s.redisClient.Del(ctx, key).Err()
			discarded++
			continue
		}

		// Restore the job
		if err := s.ScheduleOneTimeJob(job.JobID, job.TaskType, runAt, job.Data); err != nil {
			logs.ErrorCtx(ctx, "failed to restore one-time job", "component", schedulerLogComponent,
				"job_id", job.JobID, "task_type", job.TaskType, "error", err)
			_ = s.redisClient.Del(ctx, key).Err()
			discarded++
			continue
		}

		logs.InfoCtx(ctx, "restored one-time job", "component", schedulerLogComponent,
			"job_id", job.JobID, "task_type", job.TaskType, "run_at", runAt.Format(time.RFC3339))
		restored++
	}

	logs.InfoCtx(ctx, "one-time jobs restored", "component", schedulerLogComponent,
		"restored", restored, "discarded", discarded)
	return nil
}

// Start begins listening for scheduling requests and starts the scheduler
func (s *TaskScheduler) Start() error {
	// Start the gocron scheduler
	s.scheduler.Start()

	// Set up JetStream consumer for one-time job requests
	if s.jsContext != nil {
		consumer, err := helpers.SetupScheduleRequestReceiver(
			s.jsContext,
			s.processScheduleRequest,
			s.stopChan,
		)
		if err != nil {
			return fmt.Errorf("failed to setup schedule request receiver: %w", err)
		}
		s.consumer = consumer
		logs.DebugCtx(context.Background(), "scheduler started with JetStream consumer", "component", schedulerLogComponent)
	} else {
		logs.DebugCtx(context.Background(), "scheduler started (no JetStream context for one-time jobs)", "component", schedulerLogComponent)
	}

	return nil
}

// processScheduleRequest processes a schedule request message from JetStream
func (s *TaskScheduler) processScheduleRequest(msg jetstream.Msg) {
	tracer := otel.Tracer(otelTracerName)
	ctx := context.Background()
	ctx = natsprop.Extract(ctx, msg.Headers())
	ctx, span := tracer.Start(ctx, "scheduler.consume_schedule_request",
		trace.WithSpanKind(trace.SpanKindConsumer),
	)
	defer span.End()

	req, err := natscore.UnmarshalMessagePayload[natscore.ScheduleRequest](msg)
	if err != nil {
		logs.ErrorCtx(ctx, "failed to parse schedule request", "component", schedulerLogComponent, "error", err)
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		natscore.NackMessage(msg)
		return
	}

	// Generate unique job ID if not provided
	if req.JobID == "" {
		jobID, err := s.generateJobID()
		if err != nil {
			logs.ErrorCtx(ctx, "failed to generate job ID", "component", schedulerLogComponent, "error", err)
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())
			natscore.NackMessage(msg)
			return
		}
		req.JobID = jobID
	}

	// Convert run_at to time for logging
	runAt := time.Unix(0, req.RunAt*int64(time.Millisecond))
	logs.InfoCtx(ctx, "received schedule request", "component", schedulerLogComponent,
		"task_type", req.TaskType, "run_at", runAt.Format(time.RFC3339), "job_id", req.JobID)

	// Check if run_at is in the future
	now := time.Now()
	if !runAt.After(now) {
		logs.WarnCtx(ctx, "dropping schedule request - run_at is not in the future",
			"component", schedulerLogComponent,
			"job_id", req.JobID,
			"task_type", req.TaskType,
			"run_at", runAt.Format(time.RFC3339),
			"now", now.Format(time.RFC3339))
		span.SetAttributes(attribute.String("scheduler.drop_reason", "run_at_not_future"))
		span.SetStatus(codes.Ok, "dropped: run_at not in future")
		// Acknowledge and drop the message
		deliveryCount := natscore.GetDeliveryCount(msg)
		natscore.AcknowledgeMessage(msg, "run_at not in future", deliveryCount)
		return
	}

	// Check if handler exists
	_, exists := s.handlers[req.TaskType]
	if !exists {
		logs.WarnCtx(ctx, "no handler registered for task type", "component", schedulerLogComponent,
			"task_type", req.TaskType)
		span.SetAttributes(attribute.String("scheduler.drop_reason", "no_handler"))
		span.SetStatus(codes.Ok, "no handler registered")
		deliveryCount := natscore.GetDeliveryCount(msg)
		natscore.AcknowledgeMessage(msg, "no handler registered", deliveryCount)
		return
	}

	span.SetAttributes(
		attribute.String("scheduler.task_type", req.TaskType),
		attribute.String("scheduler.job_id", req.JobID),
	)

	// Schedule the one-time job
	if err := s.ScheduleOneTimeJob(req.JobID, req.TaskType, runAt, req.Data); err != nil {
		logs.ErrorCtx(ctx, "failed to schedule one-time job", "component", schedulerLogComponent,
			"job_id", req.JobID, "task_type", req.TaskType, "error", err)
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		natscore.NackMessage(msg)
		return
	}

	span.SetStatus(codes.Ok, "")
	// Acknowledge successful processing
	deliveryCount := natscore.GetDeliveryCount(msg)
	natscore.AcknowledgeMessage(msg, "successful scheduling", deliveryCount)
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
