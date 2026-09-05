package harness

import (
	"context"

	eipnats "eve-industry-planner/shared/nats"

	natslib "github.com/nats-io/nats.go"
)

// ConnectNATS connects with the product NATS SoT (NATS_URL + retry).
// Same path as soaklib and app services.
func ConnectNATS(ctx context.Context) (*natslib.Conn, error) {
	return eipnats.Connect(ctx)
}
