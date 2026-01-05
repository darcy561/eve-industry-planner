package nats

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/shared/logs"

	natslib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

// Connect establishes a connection and returns it.
// The connection includes automatic reconnection handling.
func Connect() (*natslib.Conn, error) {
	cfg := config.LoadConfig()

	retryCount := 5
	retryDelay := 5 * time.Second

	for i := 0; i < retryCount; i++ {
		// Enable automatic reconnection with callbacks
		opts := []natslib.Option{
			natslib.ReconnectWait(2 * time.Second),
			natslib.MaxReconnects(-1), // Unlimited reconnects
			natslib.DisconnectErrHandler(func(nc *natslib.Conn, err error) {
				if err != nil {
					logs.Warn("NATS disconnected", "error", err)
				}
			}),
			natslib.ReconnectHandler(func(nc *natslib.Conn) {
				logs.Info("NATS reconnected", "url", nc.ConnectedUrl())
			}),
			natslib.ClosedHandler(func(nc *natslib.Conn) {
				logs.Warn("NATS connection closed")
			}),
			natslib.ErrorHandler(func(nc *natslib.Conn, sub *natslib.Subscription, err error) {
				if err != nil {
					logs.Error("NATS error", "error", err)
				}
			}),
			natslib.Timeout(retryDelay),
		}

		conn, err := natslib.Connect(cfg.NATS_URL, opts...)
		if err == nil {
			i++
			message := fmt.Sprintf("Connected to NATS on attempt %d/%d", i, retryCount)
			logs.Debug(message, "url", conn.ConnectedUrl())
			return conn, nil
		}
		i++
		message := fmt.Sprintf("Failed to connect to NATS. Attempt %d/%d. Error: %v", i, retryCount, err.Error())
		logs.Error(message)
		time.Sleep(retryDelay)
	}

	message := fmt.Sprintf("Failed to connect to NATS after %d attempts. Exiting...", retryCount)
	return nil, errors.New(message)
}

// ConnectJetStream establishes a connection and returns both the connection and JetStream context.
// This is a convenience function for services that need both.
func ConnectJetStream() (*natslib.Conn, jetstream.JetStream, error) {
	conn, err := Connect()
	if err != nil {
		return nil, nil, err
	}

	js, err := GetJetStream(conn)

	if err != nil {
		conn.Close()
		return nil, nil, err
	}

	return conn, js, err
}

// GetJetStream returns a JetStream context from the connection using the new API.
// Use this when you already have a connection.
// Note: JetStream contexts automatically work with NATS connection reconnection.
// If the connection is reconnected, JetStream operations will automatically use the
// reconnected connection without needing to recreate the context.
func GetJetStream(conn *natslib.Conn) (jetstream.JetStream, error) {
	js, err := jetstream.New(conn)
	if err != nil {
		return nil, fmt.Errorf("failed to get JetStream context: %w", err)
	}
	return js, nil
}

// Cleanup drains and closes the provided NATS connection.
func Cleanup(conn *natslib.Conn) {
	if conn == nil {
		return
	}
	_ = conn.Drain()
	conn.Close()
}

// MessageAcker interface for messages that can be acknowledged.
// Used by NackWithBackoff to work with JetStream messages.
type MessageAcker interface {
	Ack() error
	Nak() error
	Term() error
	InProgress() error
	NakWithDelay(delay time.Duration) error
	NumDelivered() uint64
}

// NackWithBackoff performs a NAK with exponential backoff based on delivery count,
// and terminates the message after a maximum number of deliveries.
// Backoff schedule: 1s, 2s, 4s, 8s, ... capped at 60s.
func NackWithBackoff(msg MessageAcker) {
	const maxDeliveries = 5
	deliveries := msg.NumDelivered()
	if deliveries >= maxDeliveries {
		logs.Warn("nats message terminated after max deliveries", "deliveries", deliveries, "reason", "max_retries_exceeded")
		_ = msg.Term()
		return
	}
	delaySecs := 1 << (deliveries - 1)
	if delaySecs > 60 {
		delaySecs = 60
	}
	logs.Warn("nats message nak with backoff", "deliveries", deliveries, "delay_secs", delaySecs, "reason", "retry_with_backoff")
	_ = msg.NakWithDelay(time.Duration(delaySecs) * time.Second)
}

// PublishMessage publishes a message to NATS JetStream with retry logic.
// This is a general-purpose helper for publishing any message type to NATS.
// Retries up to 5 times with exponential backoff on connection/stream errors.
// If natsConn is provided, it will check connection status and retry on failure.
func PublishMessage(js jetstream.JetStream, subject string, msgData []byte, natsConn ...*natslib.Conn) error {
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
			if attempt > 0 {
				time.Sleep(200 * time.Millisecond)
			}
		}

		// Try to publish with context timeout
		publishCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		pubAck, err := js.Publish(publishCtx, subject, msgData)
		cancel()
		if err == nil {
			if attempt > 0 {
				logs.Info("JetStream publish succeeded after retry", "attempt", attempt+1, "subject", subject)
			} else {
				// Log successful publish for debugging
				if pubAck != nil {
					logs.Debug("JetStream message published", "subject", subject, "sequence", pubAck.Sequence)
				} else {
					logs.Debug("JetStream message published", "subject", subject)
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

// UnmarshalMessage unmarshals JSON data from a NATS JetStream message into the provided struct.
// This is a convenience helper for parsing message data in message processors.
// Returns an error if the message data cannot be unmarshaled into the target type.
func UnmarshalMessage(msg jetstream.Msg, v interface{}) error {
	messageData := msg.Data()
	if err := json.Unmarshal(messageData, v); err != nil {
		return fmt.Errorf("failed to unmarshal message data: %w", err)
	}
	return nil
}

// ExtractIDFromSubject extracts an ID from a NATS subject after a given prefix.
// Subject format: {prefix}.{id} or {prefix}.{nested.id}
// Example: ExtractIDFromSubject("doc.update.user.account123", "doc.update") returns "user.account123"
// Example: ExtractIDFromSubject("doc.subscribe.account123", "doc.subscribe") returns "account123"
// Returns the extracted ID and an error if the subject format is invalid.
func ExtractIDFromSubject(subject string, prefix string) (string, error) {
	// Ensure prefix ends with a dot for proper matching
	prefixWithDot := prefix
	if !strings.HasSuffix(prefix, ".") {
		prefixWithDot = prefix + "."
	}

	// Check if subject starts with prefix
	if !strings.HasPrefix(subject, prefixWithDot) {
		return "", fmt.Errorf("subject does not match prefix: subject=%s, prefix=%s", subject, prefix)
	}

	// Extract the ID part (everything after prefix.)
	id := strings.TrimPrefix(subject, prefixWithDot)
	if id == "" {
		return "", fmt.Errorf("subject has no ID after prefix: subject=%s, prefix=%s", subject, prefix)
	}

	return id, nil
}
