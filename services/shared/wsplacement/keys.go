// Package wsplacement holds fixed Redis key / cookie / channel contracts for
// ws-router, websocket, API affinity cookies, and swarm ops scripts.
// Not operator-overridable — change here and keep shell script literals in sync.
package wsplacement

import "time"

const (
	AffinityCookie = "eip_tenant_affinity"
	StickyCookie   = "eip_ws_affinity"

	PlacementPrefix = "eip:ws:place:v1:"
	PinPrefix       = "eip:ws:pin:v1:"
	CordonPrefix    = "eip:ws:cordon:v1:"
	FullPrefix      = "eip:ws:full:v1:"
	DrainChannel    = "eip:ws:drain:v1"

	// PlacementTTL is Redis TTL for eip:ws:place:v1:* (ws-router SET/EXPIRE; ops scripts use 86400s).
	PlacementTTL = 24 * time.Hour
)
