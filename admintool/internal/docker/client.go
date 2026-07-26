package docker

import (
	"time"

	"github.com/docker/docker/client"
)

// DefaultClientTimeout bounds dial/API waits (Desktop restart, missing pipe).
const DefaultClientTimeout = 4 * time.Second

// NewClient returns an Engine SDK client for the resolved CLI endpoint.
//
// Flow: ResolveDockerEndpoint → WithHost or FromEnv → API version negotiation
// → caller extras. Availability is validated by Ping/Info on the client, not by
// inspecting OS services. All admintool Engine access should use this helper.
func NewClient(extra ...client.Opt) (*client.Client, error) {
	host, err := ResolveDockerEndpoint()
	if err != nil {
		return nil, err
	}

	opts := []client.Opt{
		client.WithAPIVersionNegotiation(),
	}
	if host != "" {
		opts = append(opts, client.WithHost(host))
	} else {
		opts = append(opts, client.FromEnv)
	}
	opts = append(opts, extra...)
	return client.NewClientWithOpts(opts...)
}
