package nats

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"eve-industry-planner/shared/logs"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
)

// Message type constants for the Message.Type field
const (
	MessageTypeTask         = "task"         // Task message type
	MessageTypeSchedule     = "schedule"     // Schedule message type
	MessageTypeEmpty        = "empty"        // Empty message type
	MessageTypeSubscription = "subscription" // Legacy envelope type (historic doc.subscribe payloads)
	MessageTypeHealth       = "health"       // Control-plane health census (core NATS, not JetStream)
	MessageTypeWSPlacement  = "ws_placement" // Websocket placement load flags (core NATS pub/sub)
)

const (
	// SubjectCoreSDEBuildUpdated is published by worker after SDE version-changing tasks complete.
	// Subscribers: core (metrics gauge) and api (static-data cache refresh).
	SubjectCoreSDEBuildUpdated = "core.metrics.sde.build.updated"
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

	// TraceCarrierTraceparent and TraceCarrierTracestate duplicate W3C trace context in the JSON body
	// (same values as NATS headers from natsprop.Inject) so Asynq workers still correlate when headers
	// are missing on the JetStream-delivered message.
	TraceCarrierTraceparent string `json:"trace_carrier_traceparent,omitempty"`
	TraceCarrierTracestate  string `json:"trace_carrier_tracestate,omitempty"`

	// LogContext duplicates request identity in the JSON body when JetStream omits user headers.
	LogContext *MessageLogContext `json:"log_context,omitempty"`
}

// MessageLogContext carries HTTP request identity for log correlation across NATS consumers.
type MessageLogContext struct {
	RequestID string `json:"request_id,omitempty"`
	AccountID string `json:"account_id,omitempty"`
	SessionID string `json:"session_id,omitempty"`
}

// EnrichTraceCarrierFromContext sets TraceCarrier* fields from ctx via the global TextMapPropagator.
func (m *Message) EnrichTraceCarrierFromContext(ctx context.Context) {
	if ctx == nil || m == nil {
		return
	}
	carrier := make(map[string]string)
	otel.GetTextMapPropagator().Inject(ctx, propagation.MapCarrier(carrier))
	if v := carrier["traceparent"]; v != "" {
		m.TraceCarrierTraceparent = v
	}
	if v := carrier["tracestate"]; v != "" {
		m.TraceCarrierTracestate = v
	}
}

// EnrichLogContextFromContext sets LogContext from ctx (request_id, account_id, session_id).
func (m *Message) EnrichLogContextFromContext(ctx context.Context) {
	if ctx == nil || m == nil {
		return
	}
	rid := logs.RequestIDFromContext(ctx)
	aid := logs.RequestAccountIDFromContext(ctx)
	sid := logs.RequestSessionIDFromContext(ctx)
	if rid == "" && aid == "" && sid == "" {
		return
	}
	if m.LogContext == nil {
		m.LogContext = &MessageLogContext{}
	}
	if rid != "" {
		m.LogContext.RequestID = rid
	}
	if aid != "" {
		m.LogContext.AccountID = aid
	}
	if sid != "" {
		m.LogContext.SessionID = sid
	}
}

// MergeTraceCarrierIntoHeaders fills missing traceparent/tracestate in headers from JSON envelope fields.
func MergeTraceCarrierIntoHeaders(headers map[string]string, traceparent, tracestate string) map[string]string {
	if traceparent == "" && tracestate == "" {
		return headers
	}
	if headers == nil {
		headers = make(map[string]string)
	}
	if traceparent != "" {
		if _, ok := headers["traceparent"]; !ok {
			headers["traceparent"] = traceparent
		}
	}
	if tracestate != "" {
		if _, ok := headers["tracestate"]; !ok {
			headers["tracestate"] = tracestate
		}
	}
	return headers
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
//
// Priority, when set, overrides the worker's default priority for this task type.
//
// Timeout override (JSON field "timeout_seconds"):
//   - Must be expressed in whole seconds only (e.g. 90 for 90 seconds, 1800 for 30 minutes).
//   - Do not send minutes, milliseconds, or duration strings; the worker multiplies this integer by time.Second for asynq.
//   - Omit the field or use 0 to keep the per-task-type default from shared/tasks (Go time.Duration there).
//   - Values are clamped server-side (see worker asynq GetTaskTimeout).
type TaskMessage struct {
	TaskType       string          `json:"task_type"`                 // Task type identifier
	Data           json.RawMessage `json:"data,omitempty"`            // Optional task-specific data
	Priority       string          `json:"priority,omitempty"`        // Optional queue name override (e.g. "priority_5"); empty uses task default
	TimeoutSeconds int             `json:"timeout_seconds,omitempty"` // NATS override: asynq handler timeout as a count of seconds (int only; not minutes/ms)
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

// HealthPing is an optional payload on health.command.ping (raw or Message.Data).
// Empty Role means all roles should Respond; non-empty filters to that role.
type HealthPing struct {
	Role string `json:"role,omitempty"`
}

// HealthStatus is the census reply payload (Message.Type == MessageTypeHealth).
type HealthStatus struct {
	Role       string `json:"role"`
	InstanceID string `json:"instance_id"`
	Healthy    bool   `json:"healthy"`
	Ready      bool   `json:"ready"`
	Error      string `json:"error,omitempty"`
	TimeUnixMs int64  `json:"time_unix_ms"`
}

// MessageType returns the message type identifier for HealthStatus.
func (HealthStatus) MessageType() string {
	return MessageTypeHealth
}

// PlacementState is the raw JSON payload for SubjectWSPlacementState (not a Message envelope)
// and for websocket GET /placement.
type PlacementState struct {
	ContainerID string `json:"container_id"`
	Clients     int    `json:"clients"`
	Soft        bool   `json:"soft"`
	Full        bool   `json:"full"`
	Draining    bool   `json:"draining"`
}

// MessageType returns the message type identifier for PlacementState.
func (PlacementState) MessageType() string {
	return MessageTypeWSPlacement
}

// ParsePlacementState decodes raw PlacementState JSON (not a Message envelope).
func ParsePlacementState(data []byte) (PlacementState, error) {
	var s PlacementState
	if err := json.Unmarshal(data, &s); err != nil {
		return PlacementState{}, err
	}
	s.ContainerID = strings.TrimSpace(s.ContainerID)
	if s.ContainerID == "" {
		return PlacementState{}, fmt.Errorf("nats: placement state container_id required")
	}
	if s.Clients < 0 {
		s.Clients = 0
	}
	return s, nil
}

// MarketPricesRequest represents the JSON data payload for market prices refresh task.
// This struct is used as the Data field content in TaskMessage when triggering market prices refreshes.
// The JSON representation of this struct is embedded in TaskMessage.Data.
type MarketPricesRequest struct {
	TypeID     int32 `json:"type_id"`     // Item type ID to refresh
	LocationID int32 `json:"location_id"` // Region ID for the market endpoint
	StationID  int64 `json:"station_id"`  // Station ID to filter orders (matches order.LocationID)
}

// SDEApplyVersionRequest represents a request to apply a specific SDE build.
// The worker will build/persist this version and then lock to it.
type SDEApplyVersionRequest struct {
	BuildNumber int `json:"build_number"`
}

// SDECurrentBuildUpdate notifies subscribers that live SDE in the object store changed.
type SDECurrentBuildUpdate struct {
	BuildNumber int    `json:"build_number"`
	Version     string `json:"version,omitempty"`
}

// AccountSessionGrantsRequest is the worker payload for resolving corporation and alliance IDs
// from ESI character affiliation using the supplied EVE SSO access tokens.
// Embedded in TaskMessage.Data when publishing task.auth.updateAccountSessionGrants.
type AccountSessionGrantsRequest struct {
	AccountID string   `json:"account_id"`
	Tokens    []string `json:"tokens"` // EVE SSO JWT access tokens (one per character)
}

// MigrateUserDocumentToMongoRequest represents the data sent to the worker for migrating a Firebase user document to MongoDB.
// The worker fetches the user document from Firestore using accountID.
type MigrateUserDocumentToMongoRequest struct {
	AccountID string `json:"account_id"` // Account ID (Firebase UID)
}

// MigrateFirestoreWatchlistToMongoRequest copies Firestore ProfileInfo/Watchlist → Mongo user_watchlist_deprecated.
type MigrateFirestoreWatchlistToMongoRequest struct {
	AccountID string `json:"account_id"`
}

// ImportArchivedJobToMongoRequest is the payload for one ArchivedJobs Firestore document to normalize and upsert into the archivedJobs collection.
// CanonicalBuildVer is optional; when empty the worker resolves it for structured logs only (not persisted on the job document).
type ImportArchivedJobToMongoRequest struct {
	UserID              string          `json:"user_id"`
	FirestorePath       string          `json:"firestore_path,omitempty"`
	FirestoreDocumentID string          `json:"firestore_document_id,omitempty"`
	RawData             json.RawMessage `json:"raw_data"`
	CanonicalBuildVer   string          `json:"canonical_build_ver,omitempty"`
}

// ProcessArchivedBuildStatsRequest scopes build_stats aggregation to one account's archived jobs.
type ProcessArchivedBuildStatsRequest struct {
	AccountID string `json:"account_id"`
}

// ImportUserJobDocumentsForAccountRequest runs firestoremig.ImportAllReferencedUserJobDocumentsForAccount in the worker.
// LoginRecencyMaxAgeSeconds: 0 = apply server default window (~2y of Auth activity). -1 = skip Auth check. >0 = max window in seconds.
type ImportUserJobDocumentsForAccountRequest struct {
	AccountID                 string `json:"account_id"`
	LoginRecencyMaxAgeSeconds int64  `json:"login_recency_max_age_seconds,omitempty"`
}

// RotateRefreshTokenKeysRequest is the per-account maintenance task payload for key rotation.
type RotateRefreshTokenKeysRequest struct {
	AccountID   string `json:"account_id"`
	FromVersion string `json:"from_version,omitempty"`
	DryRun      bool   `json:"dry_run,omitempty"`
}

// SchemaVersionMaintenanceBatchRequest scopes one schema-maintenance batch run.
type SchemaVersionMaintenanceBatchRequest struct {
	Collection string `json:"collection"`
	BatchSize  int    `json:"batch_size,omitempty"`
}

// InactiveAccountPlannerCleanupRequest removes planner jobs/groups for one account (worker task).
type InactiveAccountPlannerCleanupRequest struct {
	AccountID     string `json:"account_id"`
	StaleAgeYears int    `json:"stale_age_years,omitempty"` // default 2 when 0 or unset; worker recomputes cutoff from this
}

// CloudStoredEsiRefreshMaintenanceRequest rotates encrypted cloud ESI refresh tokens for one account.
type CloudStoredEsiRefreshMaintenanceRequest struct {
	AccountID               string `json:"account_id"`
	RotateAfterLoginDays    int    `json:"rotate_after_login_days,omitempty"`    // default 25
	AbandonAfterLoginMonths int    `json:"abandon_after_login_months,omitempty"` // default 6
}

// EncryptCloudRefreshTokensRequest is the per-account migration task payload for
// encrypting legacy plaintext refreshTokens[].rToken rows.
type EncryptCloudRefreshTokensRequest struct {
	AccountID string `json:"account_id"`
	DryRun    bool   `json:"dry_run,omitempty"`
}

// MigrateUserCloudAccountsToUserDocRequest is the per-account migration payload
// for moving userCloudAccounts from application_settings to users.
type MigrateUserCloudAccountsToUserDocRequest struct {
	AccountID string `json:"account_id"`
	DryRun    bool   `json:"dry_run,omitempty"`
}

// SubscriptionRequest is retained for decoding legacy JetStream payloads (MessageTypeSubscription).
type SubscriptionRequest struct {
	Collection string   `json:"collection"` // MongoDB collection name (e.g., "users", "jobs")
	DocIDs     []string `json:"docIDs"`     // Array of document IDs to subscribe to
}

// MessageType returns the NATS envelope type for UnmarshalMessagePayload type matching.
func (SubscriptionRequest) MessageType() string {
	return MessageTypeSubscription
}

// Add more message types here as needed for your application
