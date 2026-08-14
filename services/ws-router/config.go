package main

import (
	"os"
	"strings"
	"time"

	"eve-industry-planner/shared/wsplacement"
)

// Default only for local runs without the stack proxy. Swarm injects
// DOCKER_HOST=tcp://ws-docker-proxy:2375 (allowlisted socket proxy).
const dockerHostDefault = "unix:///var/run/docker.sock"

type config struct {
	ListenAddr          string
	WebsocketService    string // Swarm service name (stack SoT)
	BackendPort         string // WS traffic port (stack SoT); also hosts GET /placement
	BackendProbeTimeout time.Duration
	DockerHost          string // stack SoT: tcp://ws-docker-proxy:2375
	BackendPollEvery    time.Duration
	AffinityCookie      string
	StickyCookie        string
}

func loadConfig() config {
	return config{
		// Stack injects these in docker-stack.yml (deploy SoT for listen/discovery/proxy).
		ListenAddr:       env("EIP_WS_ROUTER_LISTEN", ":8080"),
		WebsocketService: env("EIP_WEBSOCKET_SERVICE", "eip_websocket"),
		BackendPort:      env("EIP_WS_BACKEND_PORT", "4001"),
		DockerHost:       env("DOCKER_HOST", dockerHostDefault),

		BackendProbeTimeout: 2 * time.Second,
		BackendPollEvery:    3 * time.Second,

		AffinityCookie: wsplacement.AffinityCookie,
		StickyCookie:   wsplacement.StickyCookie,
	}
}

func env(k, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return fallback
}
