package sync

import "time"

const (
	// SyncQueueBufferSize is the buffer size for sync operation queues
	SyncQueueBufferSize = 50

	// SyncTimeout is the maximum time allowed for a sync operation
	SyncTimeout = 30 * time.Second
)

