// Package ledgerbench compares two ways of accounting for ESI token spend
// inside a floating window, so the cost of each can be measured rather than
// argued about.
//
// The ledger scheme is what services/shared/esiclient runs today: one sorted-set
// member per call, scored by its own expiry, walked in full on every reserve.
// Its read cost grows with traffic — up to an allowance divided by the cheapest
// charge, which is 12,000 members for a 12,000-token bucket met entirely by
// conditional hits.
//
// The slot scheme puts charges into fixed time buckets and lets Redis expire
// them. Slot names are computable from the clock, so a read is one MGET of a
// known set of keys and costs the same whatever the traffic.
//
// This is a measurement harness, not a design decision. Run it against a
// throwaway Redis on 6399:
//
//	docker run -d --rm --name eip-bench-redis -p 6399:6379 redis:8
package ledgerbench
