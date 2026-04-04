package server

import (
	"eve-industry-planner/shared/shared/logs"
)

// enqueueBulkOperation enqueues bulk operations to the incoming bulk queue
func (s *Server) enqueueBulkOperation(operations []Operation) {
	// Channel operations are thread-safe in Go
	// Enqueue bulk operation (non-blocking)
	select {
	case s.incomingBulkQueue.ch <- operations:
		// Signal coordinator that bulk work is available
		select {
		case s.incomingBulkSignals <- struct{}{}:
			// Signal sent successfully
		default:
			// Signal channel full - will be picked up by scan
			logs.Debug("bulk signal channel full, will be picked up by scan")
		}

		logs.Debug("bulk operation enqueued",
			"operation_count", len(operations))

	default:
		// Queue full - drop message
		logs.Warn("bulk queue full, dropping bulk operation",
			"operation_count", len(operations))
	}
}
