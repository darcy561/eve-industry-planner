// Package harness holds cross-soak helpers under services/testing.
//
// Import: eve-industry-planner/testing/harness
//
// Owns: NATS connect (product SoT), PollUntil loops, Asynq Redis opts.
// Does not own: WS hold/dial (soaklib), Swarm Observer / phases (capsoak),
// or capacity-controller clusterfake.
//
// Dependency direction: soaklib and capsoak may import harness; harness must
// not import soaklib or capsoak (avoids cycles).
package harness
