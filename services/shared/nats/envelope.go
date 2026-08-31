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
	MessageTypeTask        = "task"         // Task message type
	MessageTypeEmpty       = "empty"        // Empty message type
	MessageTypeHealth      = "health"       // Control-plane health census (core NATS, not JetStream)
	MessageTypeWSPlacement = "ws_placement" // Websocket placement load flags (core NATS pub/sub)
	MessageTypeWSCommand   = "ws_command"   // Planned cordon/drain/uncordon ack
)

const (
	// SubjectCoreSDEBuildUpdated is published by worker after SDE version-changing tasks complete.
	// Subscribers: core (metrics gauge) and api (static-data cache refresh).
	SubjectCoreSDEBuildUpdated = "core.metrics.sde.build.updated"
)

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

// TaskMessage is the payload of a "task" message: which task, and its data. The
// queue and deadline come from the task's definition, resolved by name in the
// worker.
type TaskMessage struct {
	TaskType string          `json:"task_type"`
	Data     json.RawMessage `json:"data,omitempty"`
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

	// Optional census fields (capacity Observe / dashboards). Omitempty keeps replies lean.
	AppVersion        string `json:"app_version,omitempty"`
	Clients           int    `json:"clients,omitempty"`
	Soft              bool   `json:"soft,omitempty"`
	Full              bool   `json:"full,omitempty"`
	Draining          bool   `json:"draining,omitempty"`
	HostedTenantCount int    `json:"hosted_tenant_count,omitempty"`
	ActiveTasks       int    `json:"active_tasks,omitempty"`
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

// WSCommand is the req payload for ws.command.cordon|drain|uncordon.
type WSCommand struct {
	ContainerID string `json:"container_id"`
}

// WSCommandAck is the reply payload (Message.Type == MessageTypeWSCommand).
type WSCommandAck struct {
	OK          bool   `json:"ok"`
	ContainerID string `json:"container_id"`
	Action      string `json:"action"` // cordon | drain | uncordon
	Error       string `json:"error,omitempty"`
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

// SDECurrentBuildUpdate notifies subscribers that live SDE in the object store changed.
type SDECurrentBuildUpdate struct {
	BuildNumber int    `json:"build_number"`
	Version     string `json:"version,omitempty"`
}

// Add more message types here as needed for your application
