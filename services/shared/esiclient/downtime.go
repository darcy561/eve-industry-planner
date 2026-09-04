package esiclient

import "time"

// Tranquility's daily downtime is announced as a window, and that announcement
// is an estimate: it finishes early or runs long, and CCP can move it. Nothing
// here encodes it.
//
// Availability is read from what the servers answer. An outage fails everything
// at once, so failures spread across sources within a request or two — which is
// as fast as knowing the clock would have made it, and stays right when the
// schedule changes. A clock would also have been wrong in the dangerous
// direction: resuming at the window's nominal end into a server that is still
// down means every call answers 5xx, and the legacy error limit counts
// non-2xx/3xx across every ESI route, so a routine overrun would take the fleet
// off the air.
//
// The gate is fleet-wide, lives in Redis beside the buckets, and is read by the
// same script that reserves a slot, so watching for downtime costs no extra
// round trip.

// downtimeBackoff bounds how often the fleet probes a server it believes is
// down. The cap is what recovery costs: the fleet resumes one probe after the
// server returns, so a minute's backoff is a minute of lost time on a downtime
// that lasts fifteen.
//
// Twenty seconds bounds that lag while costing three failed calls a minute
// against a fleet-wide limit of a hundred — the probe is cheap, and waiting is
// not.
const (
	downtimeProbeFirst = 2 * time.Second
	downtimeProbeMax   = 20 * time.Second
	downtimeProbeTTL   = 20 * time.Second
)

// How the fleet tells an outage from one broken endpoint.
//
// Tranquility going away fails everything, so failures spread across sources —
// buckets, and callers like SSO that have none. A single source failing over and
// over is that source: retries alone should not gate the fleet, which is how one
// bad batch of a login could otherwise stop every refresh. A fleet whose only
// traffic is that one source still concludes an outage, just on more evidence.
const (
	failuresBeforeConcluding = 3
	sourcesToTripDowntime    = 2
	loneSourceFailures       = 8
)

// LoneSourceFailures is how many failures from a single source conclude an
// outage when nothing else is failing.
func LoneSourceFailures() int { return loneSourceFailures }

// DowntimeProbeCeiling is the longest the fleet waits between probes of a server
// it believes is down, and so the most that recovery can lag behind it.
func DowntimeProbeCeiling() time.Duration { return downtimeProbeMax }

// DowntimeState is what the fleet currently believes about availability.
type DowntimeState struct {
	Gated     bool
	NextProbe time.Time
	Failures  int
	LastOK    time.Time
}
