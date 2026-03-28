package nats

import "encoding/json"

// Message type constants for the Message.Type field
const (
	MessageTypeTask     = "task"     // Task message type
	MessageTypeSchedule = "schedule" // Schedule message type
	MessageTypeEmpty    = "empty"    // Empty message type
)

// MessageType is an interface that message payload types can implement to specify their message type.
// If a type implements this interface, Publish will use the returned type string.
// Otherwise, the type name will be used as the message type.
type MessageType interface {
	MessageType() string
}

// Message represents a generic message with a type and optional payload data.
// This is the unified message structure used for all NATS message publishing.
type Message struct {
	Type string          `json:"type"`           // Message type identifier (e.g., "task", "schedule", "empty")
	Data json.RawMessage `json:"data,omitempty"` // Optional JSON-encoded payload data
}

// ScheduleRequest represents a request to schedule a one-time task.
// Used for scheduling tasks via the scheduler.schedule subject.
// This is the payload structure for "schedule" type messages.
type ScheduleRequest struct {
	JobID    string          `json:"job_id,omitempty"` // Unique job identifier (optional, will be generated if not provided)
	TaskType string          `json:"task_type"`        // e.g., "refreshSystemIndexes"
	RunAt    int64           `json:"run_at"`           // Unix timestamp in milliseconds
	Data     json.RawMessage `json:"data,omitempty"`   // Optional JSON-encoded data to pass to the task handler
}

// MessageType returns the message type identifier for ScheduleRequest.
func (ScheduleRequest) MessageType() string {
	return MessageTypeSchedule
}

// TaskMessage represents a generic task message with optional data and optional priority override.
// This is the payload structure for "task" type messages.
// Priority, when set, overrides the worker's default priority for this task type.
type TaskMessage struct {
	TaskType string          `json:"task_type"`          // Task type identifier
	Data     json.RawMessage `json:"data,omitempty"`     // Optional task-specific data
	Priority string          `json:"priority,omitempty"` // Optional queue name override (e.g. "priority_5"); empty uses task default
}

// MessageType returns the message type identifier for TaskMessage.
func (TaskMessage) MessageType() string {
	return MessageTypeTask
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

// MigrateUserDocumentToMongoRequest represents the data sent to the worker for migrating a Firebase user document to MongoDB.
// The worker fetches the user document from Firestore using accountID.
type MigrateUserDocumentToMongoRequest struct {
	AccountID string `json:"account_id"` // Account ID (Firebase UID)
}

// SubscriptionRequest represents a request to subscribe WebSocket clients to document updates.
// Used for autosubscription when clients make HTTP requests with the AutoSubscribe header.
// Published to doc.subscribe.{accountID} subject.
type SubscriptionRequest struct {
	Collection string   `json:"collection"` // MongoDB collection name (e.g., "users", "jobs")
	DocIDs     []string `json:"docIDs"`     // Array of document IDs to subscribe to
}

// Add more message types here as needed for your application
