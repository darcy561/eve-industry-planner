package harness

import (
	natscore "eve-industry-planner/shared/core/nats"

	natslib "github.com/nats-io/nats.go"
)

// ConnectNATS connects with the product NATS SoT (NATS_URL + retry).
// Same path as soaklib and app services.
func ConnectNATS() (*natslib.Conn, error) {
	return natscore.Connect()
}
