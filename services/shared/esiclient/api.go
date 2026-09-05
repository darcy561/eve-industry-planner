package esiclient

import "context"

// API is what a caller needs from the ESI client, so a task or handler can be
// tested against a double rather than a live origin. *Client satisfies it, and
// so does the fake in testing/esifake.
type API interface {
	// Do makes the call and reads the whole body.
	Do(ctx context.Context, req Request) (*Response, error)
	// Stream makes the call and hands back a reader the caller closes, and the
	// count of bytes it took off the connection.
	Stream(ctx context.Context, req Request) (*Stream, error)
	// Headroom reports what one class may spend against a path's bucket.
	Headroom(ctx context.Context, path string, id Identity, class Class) (Headroom, error)
	// CanAfford is Headroom against a threshold.
	CanAfford(ctx context.Context, path string, id Identity, class Class, tokens int) (bool, Headroom, error)

	// Availability reports whether CCP's servers are answering, for work that an
	// outage stops but that does not call ESI and holds no budget.
	Availability(ctx context.Context) (DowntimeState, error)

	// Observe feeds such a caller's outcome back, so its failures count as
	// evidence and its successes clear the gate.
	Observe(ctx context.Context, source string, reachable bool) error
}

var _ API = (*Client)(nil)
