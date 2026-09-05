package nats

import (
	"encoding/json"
	"fmt"
	"strings"
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
	Type string `json:"type"` // Message type identifier (e.g., "task", "schedule", "empty")
	// Subtype names what the message is within its type, so a message is
	// described the same way between services as it is to a browser and a new
	// kind is one definition rather than two that must be kept aligned. A message
	// without one keeps the meaning its Type already carries.
	Subtype string          `json:"subtype,omitempty"`
	Data    json.RawMessage `json:"data,omitempty"` // Optional JSON-encoded payload data
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
