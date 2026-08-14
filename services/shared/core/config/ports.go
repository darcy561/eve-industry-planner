package config

import "eve-industry-planner/shared/core/swarmsecret"

// APIPort returns the API listen port (default 4000).
func APIPort() string {
	return or(swarmsecret.Get("API_PORT"), "4000")
}

// WSPort returns the websocket listen port (default 4001).
func WSPort() string {
	return or(swarmsecret.Get("WS_PORT"), "4001")
}
