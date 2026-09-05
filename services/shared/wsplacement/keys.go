// Package wsplacement holds fixed placement contracts for ws-router, websocket,
// and API affinity cookies. Not operator-overridable.
//
// Cookies live here. HTTP path: StatusPath.
// NATS subject/payload SoT: shared/nats (SubjectWSPlacementState, PlacementState).
// Tenant strings are models.Owner.Key(); this package does not build them.
package wsplacement

const (
	AffinityCookie = "eip_tenant_affinity"
	StickyCookie   = "eip_ws_affinity"
)
