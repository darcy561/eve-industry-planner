package docker

import (
	"time"

	"github.com/moby/moby/client"
)

// DefaultClientTimeout bounds dial/API waits (Desktop restart, missing pipe).
const DefaultClientTimeout = 4 * time.Second

// NewAPIClient returns a Moby Engine API client (*client.Client).
//
// This is the SDK handle used everywhere Engine work happens. Do not name the
// variable "cli" — that means the docker binary (internal/dockercli) or eip
// Cobra verbs. Prefer apiClient at call sites.
//
// Flow: ResolveDockerEndpoint → WithHost or FromEnv → caller extras.
// Availability is validated by Ping/Info on the client, not by inspecting OS
// services. All deployment-tool Engine access should use this helper.
func NewAPIClient(extra ...client.Opt) (*client.Client, error) {
	host, err := ResolveDockerEndpoint()
	if err != nil {
		return nil, err
	}

	opts := []client.Opt{}
	if host != "" {
		opts = append(opts, client.WithHost(host))
	} else {
		opts = append(opts, client.FromEnv)
	}
	opts = append(opts, extra...)
	return client.New(opts...)
}
