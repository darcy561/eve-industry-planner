// Package soaklib runs live-stack WebSocket soak profiles against eip-core
// (ws-router / Traefik): hold, limits, pressure (placement / divert / coloc),
// and fanout (JetStream → WS). Reusable from other testing harnesses via
// eve-industry-planner/testing/ws_soak/lib.
//
// CLI: go build -o ../.tmp/ws_soak ./ws_soak
// Tests: go test ./ws_soak/lib/...

package soaklib
