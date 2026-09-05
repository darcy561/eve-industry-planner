package httpclient

import "context"

// Gate admits and settles every attempt the client makes, retries included.
// A rate limiter is a Gate: Admit reserves the budget one request will spend,
// Settle reconciles it against what the response actually cost.
//
// Every attempt is a real request, so each is admitted and settled on its own.
// A retry loop outside a client that admitted once would send requests nothing
// had reserved.
type Gate interface {
	// Admit runs before an attempt reaches the network. An error abandons the
	// call: the gate owns the timing, so its refusals are never retried.
	Admit(ctx context.Context, req *Request) (Ticket, error)

	// Settle runs once per admitted attempt. resp is nil when the attempt
	// produced no response.
	Settle(ctx context.Context, ticket Ticket, resp *Response, err error)
}

// Ticket is whatever a Gate needs to match a Settle to its Admit.
type Ticket any

// gateError marks a refusal as the gate's decision so the retry loop leaves it.
// Always constructed as a pointer; the retry checks match on *gateError.
type gateError struct{ err error }

func (e *gateError) Error() string { return e.err.Error() }
func (e *gateError) Unwrap() error { return e.err }

func (c *Client) admit(ctx context.Context, req *Request) (Ticket, error) {
	if c.gate == nil {
		return nil, nil
	}
	ticket, err := c.gate.Admit(ctx, req)
	if err != nil {
		return nil, &gateError{err: err}
	}
	return ticket, nil
}

func (c *Client) settle(ctx context.Context, ticket Ticket, resp *Response, err error) {
	if c.gate == nil {
		return
	}
	c.gate.Settle(ctx, ticket, resp, err)
}
