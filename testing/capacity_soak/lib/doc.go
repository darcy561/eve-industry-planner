// Package capsoak runs live-stack capacity-controller scale drills
// (worker Asynq backlog; websocket/api via harness.StartHoldWS → soaklib).
//
// CLI: go build -o ../.tmp/capacity_soak ./capacity_soak
// Tests: go test ./capacity_soak/lib/...
//
// Shared helpers: eve-industry-planner/testing/harness
// WS clients SoT: eve-industry-planner/testing/ws_soak/lib (ProfileHold)
package capsoak
