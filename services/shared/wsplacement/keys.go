// Package wsplacement holds fixed placement contracts for ws-router, websocket,
// and API affinity cookies. Not operator-overridable.
//
// Cookies live here. HTTP path: StatusPath.
// NATS subject/payload SoT: shared/core/nats (SubjectWSPlacementState, PlacementState).
package wsplacement

const (
	AffinityCookie = "eip_tenant_affinity"
	StickyCookie   = "eip_ws_affinity"
)
