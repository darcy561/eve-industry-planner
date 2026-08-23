// Package harness holds cross-soak helpers shared across the repo test tooling.
//
// Import: eve-industry-planner/testing/harness
//
// Owns: NATS connect (product SoT), Asynq Redis opts.
// Does not own: polling loops (wait), WS hold/dial (soaklib), Swarm Observer /
// phases (capsoak), or capacity-controller clusterfake.
//
// Dependency direction: soaklib and capsoak may import harness; harness must
// not import soaklib or capsoak (avoids cycles).
package harness
