package metrics

import (
	"sync"
	"time"

	"eve-industry-planner/shared/shared/logs"
)

// WebSocketMetrics holds all metrics for WebSocket server operations
type WebSocketMetrics struct {
	// Connection metrics
	Connections                 *Counter
	Disconnections              *Counter
	ConnectionErrors            *CounterVec
	ActiveConnections           *Gauge
	ConnectionsPerUser          *Histogram
	ActiveConnectionsPerAccount *GaugeVec // Track active connections per account

	// Message metrics
	MessagesIncoming *Counter
	MessagesOutgoing *Counter
	MessagesSync     *Counter
	MessagesBulk     *Counter
	MessageBytesIn   *Counter
	MessageBytesOut  *Counter
	MessageRateLimit *CounterVec

	// Subscription metrics
	SubscriptionsActive *Counter
	ActiveSubscriptions *Gauge

	// Queue metrics
	QueueIncomingSize *Gauge
	QueueOutgoingSize *Gauge
	QueueBulkSize     *Gauge
	QueueSyncSize     *Gauge
	QueueOperations   *CounterVec

	// Processing metrics
	ProcessingDuration     *Histogram
	SyncDuration           *Histogram
	BulkProcessingDuration *Histogram

	// Error metrics
	Errors        *CounterVec
	WriteErrors   *Counter
	ReadErrors    *Counter
	UpgradeErrors *Counter
}

var websocketMetrics *WebSocketMetrics
var websocketOnce sync.Once

// InitWebSocket initializes and registers metrics for WebSocket server
func InitWebSocket() *WebSocketMetrics {
	websocketOnce.Do(func() {
		websocketMetrics = &WebSocketMetrics{
			Connections:                 &Counter{},
			Disconnections:              &Counter{},
			ConnectionErrors:            NewCounterVec(),
			ActiveConnections:           &Gauge{},
			ConnectionsPerUser:          &Histogram{},
			ActiveConnectionsPerAccount: NewGaugeVec(),

			MessagesIncoming: &Counter{},
			MessagesOutgoing: &Counter{},
			MessagesSync:     &Counter{},
			MessagesBulk:     &Counter{},
			MessageBytesIn:   &Counter{},
			MessageBytesOut:  &Counter{},
			MessageRateLimit: NewCounterVec(),

			SubscriptionsActive: &Counter{},
			ActiveSubscriptions: &Gauge{},

			QueueIncomingSize: &Gauge{},
			QueueOutgoingSize: &Gauge{},
			QueueBulkSize:     &Gauge{},
			QueueSyncSize:     &Gauge{},
			QueueOperations:   NewCounterVec(),

			ProcessingDuration:     &Histogram{},
			SyncDuration:           &Histogram{},
			BulkProcessingDuration: &Histogram{},

			Errors:        NewCounterVec(),
			WriteErrors:   &Counter{},
			ReadErrors:    &Counter{},
			UpgradeErrors: &Counter{},
		}
	})
	return websocketMetrics
}

// GetWebSocket returns the WebSocket metrics, initializing if needed
func GetWebSocket() *WebSocketMetrics {
	if websocketMetrics == nil {
		return InitWebSocket()
	}
	return websocketMetrics
}

// LogWebSocketMetrics logs all WebSocket metrics as structured JSON for Dozzle viewing
func LogWebSocketMetrics() {
	logger := logs.Component("metrics")

	if websocketMetrics == nil {
		return
	}

	logger.Info("WebSocket Server Metrics",
		"connections_total", websocketMetrics.Connections.Get(),
		"disconnections_total", websocketMetrics.Disconnections.Get(),
		"active_connections", websocketMetrics.ActiveConnections.Get(),
		"connection_errors", websocketMetrics.ConnectionErrors.GetCounters(),
		"connections_per_user_avg", websocketMetrics.ConnectionsPerUser.GetAvg(),
		"active_connections_per_account", websocketMetrics.ActiveConnectionsPerAccount.GetGauges(),

		"messages_incoming_total", websocketMetrics.MessagesIncoming.Get(),
		"messages_outgoing_total", websocketMetrics.MessagesOutgoing.Get(),
		"messages_sync_total", websocketMetrics.MessagesSync.Get(),
		"messages_bulk_total", websocketMetrics.MessagesBulk.Get(),
		"message_bytes_in_total", websocketMetrics.MessageBytesIn.Get(),
		"message_bytes_out_total", websocketMetrics.MessageBytesOut.Get(),
		"message_rate_limit", websocketMetrics.MessageRateLimit.GetCounters(),

		"subscriptions_active_total", websocketMetrics.SubscriptionsActive.Get(),
		"active_subscriptions", websocketMetrics.ActiveSubscriptions.Get(),

		"queue_incoming_size", websocketMetrics.QueueIncomingSize.Get(),
		"queue_outgoing_size", websocketMetrics.QueueOutgoingSize.Get(),
		"queue_bulk_size", websocketMetrics.QueueBulkSize.Get(),
		"queue_sync_size", websocketMetrics.QueueSyncSize.Get(),
		"queue_operations", websocketMetrics.QueueOperations.GetCounters(),

		"processing_duration_avg_seconds", websocketMetrics.ProcessingDuration.GetAvg(),
		"sync_duration_avg_seconds", websocketMetrics.SyncDuration.GetAvg(),
		"bulk_processing_duration_avg_seconds", websocketMetrics.BulkProcessingDuration.GetAvg(),

		"errors", websocketMetrics.Errors.GetCounters(),
		"write_errors_total", websocketMetrics.WriteErrors.Get(),
		"read_errors_total", websocketMetrics.ReadErrors.Get(),
		"upgrade_errors_total", websocketMetrics.UpgradeErrors.Get(),
	)
}

// StartWebSocketMetricsLogger starts a goroutine that periodically logs WebSocket metrics
func StartWebSocketMetricsLogger(interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for range ticker.C {
			LogWebSocketMetrics()
		}
	}()
}

// LogWebSocketRequestMetrics logs per-request metrics for WebSocket operations
// This provides real-time visibility in Dozzle for important events
func LogWebSocketRequestMetrics(operation string, duration time.Duration, status string, kv ...any) {
	logger := logs.Component("websocket_request")

	// Log slow operations (> 500ms) as warnings
	if duration > 500*time.Millisecond {
		fields := append([]any{
			"operation", operation,
			"duration_ms", duration.Milliseconds(),
			"duration_seconds", duration.Seconds(),
			"status", status,
			"slow_operation", true,
		}, kv...)
		logger.Warn("slow WebSocket operation", fields...)
		return
	}

	// Log errors immediately
	if status != "success" && status != "" {
		fields := append([]any{
			"operation", operation,
			"duration_ms", duration.Milliseconds(),
			"status", status,
		}, kv...)
		logger.Warn("WebSocket operation error", fields...)
		return
	}

	// For fast successful operations, only log if explicitly requested or if interesting metrics
	if len(kv) > 0 {
		fields := append([]any{
			"operation", operation,
			"duration_ms", duration.Milliseconds(),
			"status", status,
		}, kv...)
		logger.Info("WebSocket operation", fields...)
	}
}
