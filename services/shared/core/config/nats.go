package config

import "eve-industry-planner/shared/core/swarmsecret"

// NATSURL returns NATS_URL (mesh; plain env, not a Swarm secret file).
func NATSURL() (string, error) {
	return swarmsecret.Require("NATS_URL")
}
