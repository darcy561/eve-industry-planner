package scheduler

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/shared/logs"

	natslib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

// getStreamNameForSubject returns the stream name for a given subject
// Maps subjects to their corresponding JetStream streams
func getStreamNameForSubject(subject string) string {
	switch subject {
	case natscore.SubjectRefreshSystemIndexes,
		natscore.SubjectRefreshAdjustedPrices,
		natscore.SubjectRefreshMarketPrices,
		natscore.SubjectFetchCorporations:
		return natscore.WorkerTaskStream
	case natscore.SubjectSchedulerSchedule:
		return natscore.SchedulerStream
	default:
		return ""
	}
}

// ScheduleRequest is an alias for natscore.ScheduleRequest.
// Deprecated: Use natscore.ScheduleRequest directly instead.
type ScheduleRequest = natscore.ScheduleRequest

// PublishScheduleRequest publishes a ScheduleRequest message to JetStream.
// The request is automatically marshaled to JSON and published to the scheduler.schedule subject.
// If natsConn is provided, it will check connection status and retry on failure.
func PublishScheduleRequest(js jetstream.JetStream, req natscore.ScheduleRequest, natsConn ...*natslib.Conn) error {
	reqData, err := json.Marshal(req)
	if err != nil {
		return err
	}
	return publishWithRetry(js, natscore.SubjectSchedulerSchedule, reqData, natsConn...)
}

// PublishScheduleRequestWithData is a convenience function to publish a schedule request with structured data.
// It automatically marshals the data parameter to JSON and creates a ScheduleRequest.
// If natsConn is provided, it will check connection status and retry on failure.
func PublishScheduleRequestWithData(js jetstream.JetStream, taskType string, runAt int64, data interface{}, natsConn ...*natslib.Conn) error {
	var rawData json.RawMessage
	if data != nil {
		var err error
		rawData, err = json.Marshal(data)
		if err != nil {
			return err
		}
	}
	req := natscore.ScheduleRequest{
		TaskType: taskType,
		RunAt:    runAt,
		Data:     rawData,
	}
	return PublishScheduleRequest(js, req, natsConn...)
}

// PublishEmptyMessage publishes an EmptyMessage to the specified subject.
// Used for simple trigger messages where no data is needed.
// If natsConn is provided, it will check connection status and retry on failure.
func PublishEmptyMessage(js jetstream.JetStream, subject string, natsConn ...*natslib.Conn) error {
	msg := natscore.EmptyMessage{}
	msgData, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	return publishWithRetry(js, subject, msgData, natsConn...)
}

// publishWithRetry publishes a message with retry logic and connection status checks.
// Retries up to 5 times with exponential backoff if the NATS connection is available.
func publishWithRetry(js jetstream.JetStream, subject string, msgData []byte, natsConn ...*natslib.Conn) error {
	maxRetries := 5
	baseDelay := 500 * time.Millisecond
	maxDelay := 5 * time.Second

	var conn *natslib.Conn
	if len(natsConn) > 0 && natsConn[0] != nil {
		conn = natsConn[0]
	}

	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		// Check connection status if connection is provided
		if conn != nil {
			if !conn.IsConnected() {
				// Wait for reconnection with exponential backoff
				if attempt < maxRetries-1 {
					delay := baseDelay * time.Duration(1<<attempt)
					if delay > maxDelay {
						delay = maxDelay
					}
					logs.Info("NATS not connected, waiting for reconnection", "attempt", attempt+1, "delay_ms", delay.Milliseconds())
					time.Sleep(delay)
					continue
				}
				return errors.New("NATS connection is not connected after retries")
			}

			// Wait a bit after reconnection to let JetStream stabilize
			// Check if we recently reconnected (connection status might be stale immediately after reconnect)
			if attempt > 0 {
				time.Sleep(200 * time.Millisecond)
			}
		}

		// On retry attempts, verify stream and connection state
		streamName := getStreamNameForSubject(subject)
		var publishJS jetstream.JetStream = js
		if attempt > 0 && conn != nil {
			if streamName != "" {
				// Verify stream exists and connection is healthy
				publishCtx := context.Background()
				stream, streamErr := js.Stream(publishCtx, streamName)
				if streamErr != nil {
					logs.Warn("stream verification failed on retry", "stream", streamName, "subject", subject, "attempt", attempt+1, "error", streamErr)
				} else if stream != nil {
					logs.Debug("stream verified on retry", "stream", streamName, "subject", subject, "attempt", attempt+1)
					// Add a small delay to let any internal state settle
					time.Sleep(100 * time.Millisecond)
				}
			}

			// Log connection state
			logs.Debug("connection state check", "connected", conn.IsConnected(), "status", conn.Status().String(), "subject", subject, "attempt", attempt+1)
		}

		// Try to publish with context timeout
		// js.Publish() automatically routes to streams based on subject matching
		publishCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		pubAck, err := publishJS.Publish(publishCtx, subject, msgData)
		cancel()
		if err == nil {
			if attempt > 0 {
				logs.Info("JetStream publish succeeded after retry", "attempt", attempt+1, "subject", subject, "stream", streamName)
			} else {
				// Log successful publish for debugging
				if pubAck != nil {
					logs.Debug("JetStream message published", "subject", subject, "stream", streamName, "sequence", pubAck.Sequence)
				} else {
					logs.Debug("JetStream message published", "subject", subject, "stream", streamName)
				}
			}
			return nil
		}

		lastErr = err

		// Check if error is retryable (connection/stream errors)
		errStr := err.Error()
		isRetryable := strings.Contains(errStr, "no response from stream") ||
			strings.Contains(errStr, "connection closed") ||
			strings.Contains(errStr, "connection drained") ||
			strings.Contains(errStr, "invalid connection") ||
			strings.Contains(errStr, "connection reconnecting") ||
			strings.Contains(errStr, "timeout") ||
			strings.Contains(errStr, "no responders")

		if !isRetryable {
			logs.Warn("JetStream publish error is not retryable", "error", errStr, "subject", subject)
			return err
		}

		if attempt == maxRetries-1 {
			logs.Error("JetStream publish failed after all retries", "attempts", maxRetries, "error", errStr, "subject", subject)
			return err
		}

		// Exponential backoff before retry
		delay := baseDelay * time.Duration(1<<attempt)
		if delay > maxDelay {
			delay = maxDelay
		}
		logs.Info("JetStream publish failed, retrying", "attempt", attempt+1, "max_retries", maxRetries, "delay_ms", delay.Milliseconds(), "error", errStr, "subject", subject)
		time.Sleep(delay)
	}

	return lastErr
}

// PublishTaskMessage publishes a TaskMessage to the specified subject.
// Used for task triggers that need to pass arbitrary data.
// If natsConn is provided, it will check connection status and retry on failure.
func PublishTaskMessage(js jetstream.JetStream, subject string, taskType string, data interface{}, natsConn ...*natslib.Conn) error {
	var rawData json.RawMessage
	if data != nil {
		var err error
		rawData, err = json.Marshal(data)
		if err != nil {
			return err
		}
	}
	msg := natscore.TaskMessage{
		TaskType: taskType,
		Data:     rawData,
	}
	msgData, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	return publishWithRetry(js, subject, msgData, natsConn...)
}
