package nats

import "encoding/json"

// ScheduleRequest represents a request to schedule a one-time task.
// Used for scheduling tasks via the scheduler.schedule subject.
type ScheduleRequest struct {
	JobID    string          `json:"job_id,omitempty"` // Unique job identifier (optional, will be generated if not provided)
	TaskType string          `json:"task_type"`        // e.g., "refreshSystemIndexes"
	RunAt    int64           `json:"run_at"`           // Unix timestamp in milliseconds
	Data     json.RawMessage `json:"data,omitempty"`   // Optional JSON-encoded data to pass to the task handler
}

// EmptyMessage represents an empty message with no payload.
// Used for simple trigger messages where no data is needed.
type EmptyMessage struct{}

// TaskMessage represents a generic task message with optional data.
// Can be used for task triggers that need to pass arbitrary data.
type TaskMessage struct {
	TaskType string          `json:"task_type"`      // Task type identifier
	Data     json.RawMessage `json:"data,omitempty"` // Optional task-specific data
}

// ErrorMessage represents an error response message.
// Used for error reporting in NATS message exchanges.
type ErrorMessage struct {
	Error   string `json:"error"`             // Error message
	Code    string `json:"code,omitempty"`    // Optional error code
	Details string `json:"details,omitempty"` // Optional error details
}

// StatusMessage represents a status or health check message.
// Used for status reporting and health checks.
type StatusMessage struct {
	Status  string `json:"status"`            // Status value (e.g., "ok", "error")
	Message string `json:"message,omitempty"` // Optional status message
	Time    int64  `json:"time,omitempty"`    // Optional timestamp in Unix milliseconds
}

// MarketPricesRequest represents the JSON data payload for market prices refresh task.
// This struct is used as the Data field content in TaskMessage when triggering market prices refreshes.
// The JSON representation of this struct is embedded in TaskMessage.Data.
type MarketPricesRequest struct {
	TypeID     int32 `json:"type_id"`     // Item type ID to refresh
	LocationID int32 `json:"location_id"` // Region ID for the market endpoint
	StationID  int64 `json:"station_id"`  // Station ID to filter orders (matches order.LocationID)
}

// CorporationClaimsRequest represents the data sent to the worker for fetching corporation IDs.
// Contains AccountID and all EVE SSO tokens to process.
// This struct is used as the Data field content in TaskMessage when triggering corporation lookups.
// The JSON representation of this struct is embedded in TaskMessage.Data.
type CorporationClaimsRequest struct {
	AccountID string   `json:"account_id"` // Account ID from internal JWT token
	Tokens    []string `json:"tokens"`     // Array of EVE SSO JWT tokens
}

// SubscriptionRequest represents a request to subscribe WebSocket clients to document updates.
// Used for autosubscription when clients make HTTP requests with the AutoSubscribe header.
// Published to doc.subscribe.{accountID} subject.
type SubscriptionRequest struct {
	Collection string   `json:"collection"` // MongoDB collection name (e.g., "users", "jobs")
	DocIDs     []string `json:"docIDs"`     // Array of document IDs to subscribe to
}

// Add more message types here as needed for your application
