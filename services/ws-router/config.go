package main

import (
	"os"
	"strings"
	"time"

	"eve-industry-planner/shared/core/swarmsecret"
	"eve-industry-planner/shared/wsplacement"
)

// Default only for local runs without the stack proxy. Swarm injects
// DOCKER_HOST=tcp://ws-docker-proxy:2375 (allowlisted socket proxy).
const dockerHostDefault = "unix:///var/run/docker.sock"

type config struct {
	ListenAddr          string
	RedisHost           string
	RedisPort           string
	RedisPassword       string
	WebsocketService    string // Swarm service name (stack SoT)
	BackendPort         string // WS traffic port (stack SoT)
	BackendProbeTimeout time.Duration
	DockerHost          string // stack SoT: tcp://ws-docker-proxy:2375
	PlacementTTL        time.Duration
	BackendPollEvery    time.Duration
	AffinityCookie      string
	StickyCookie        string
	PlacementKeyPrefix  string
	PinKeyPrefix        string
	CordonKeyPrefix     string
	FullKeyPrefix       string
}

func loadConfig() config {
	pass, err := swarmsecret.Require("REDIS_PASSWORD")
	if err != nil {
		logFatal(err.Error())
	}
	redisHost := env("REDIS_HOST", "")
	if redisHost == "" {
		logFatal("REDIS_HOST is required")
	}
	redisPort := env("REDIS_PORT", "")
	if redisPort == "" {
		logFatal("REDIS_PORT is required")
	}
	return config{
		// Stack injects these in docker-stack.yml (deploy SoT for listen/discovery/proxy).
		ListenAddr:       env("EIP_WS_ROUTER_LISTEN", ":8080"),
		WebsocketService: env("EIP_WEBSOCKET_SERVICE", "eip_websocket"),
		BackendPort:      env("EIP_WS_BACKEND_PORT", "4001"),
		DockerHost:       env("DOCKER_HOST", dockerHostDefault),

		RedisHost:     redisHost,
		RedisPort:     redisPort,
		RedisPassword: pass,

		BackendProbeTimeout: 2 * time.Second,
		PlacementTTL:        wsplacement.PlacementTTL,
		BackendPollEvery:    3 * time.Second,

		AffinityCookie:     wsplacement.AffinityCookie,
		StickyCookie:       wsplacement.StickyCookie,
		PlacementKeyPrefix: wsplacement.PlacementPrefix,
		PinKeyPrefix:       wsplacement.PinPrefix,
		CordonKeyPrefix:    wsplacement.CordonPrefix,
		FullKeyPrefix:      wsplacement.FullPrefix,
	}
}

func env(k, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return fallback
}

func logFatal(msg string) {
	println("ws-router fatal:", msg)
	os.Exit(1)
}
