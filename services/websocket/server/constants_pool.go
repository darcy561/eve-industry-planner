package server

const (
	// Worker pool configuration
	// Incoming: Limited to ~2-3x MongoDB pool size (MaxPoolSize=20)
	// Increased to 3x to account for deduplication processing overhead
	IncomingPoolSize = 60 // 3x MongoDB pool (was 40/2x)
	// Outgoing: Higher limit for fast broadcasts (unlimited scaling would be 0)
	OutgoingPoolSize = 100
	// SyncPoolSize is the size of the worker pool for sync operations
	// Separate pool for sync operations
	SyncPoolSize = 20
)
