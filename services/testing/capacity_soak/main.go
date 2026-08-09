// Command capacity_soak drills capacity-controller scale-up/down on a live Swarm stack.
//
// Build:
//
//	go build -o ../.tmp/capacity_soak ./testing/capacity_soak
//
// Worker (Asynq pending while queue paused → scale up → unpause → scale down):
//
//	# Shorten scale_* timing in eip.config.yaml, eip sync, worker managed.
//	# Prefer host run with Docker so desired replicas are visible:
//	DOCKER_HOST=unix:///var/run/docker.sock REDIS_HOST=127.0.0.1 NATS_URL=nats://127.0.0.1:4222 \
//	  ./.tmp/capacity_soak -profile worker -enqueue 40 -want 2 -min 1
//
//	# Or on eip-core (NATS health counts only unless DOCKER_HOST points at capacity proxy):
//	docker run --rm --network eip-core --env-file ../.env \
//	  -e LOG_LEVEL=warn -e REDIS_HOST=redis -e NATS_URL=nats://nats:4222 \
//	  -v "$PWD/../.tmp/capacity_soak:/capacity_soak:ro" --entrypoint /capacity_soak alpine:3.20 \
//	  -profile worker -enqueue 40 -want 2
//
// Websocket (hold soak load → scale up → stop load → scale down):
//
//	# Sync low target_clients (e.g. 40) + short scale_*; websocket managed; start with min replicas.
//	DOCKER_HOST=unix:///var/run/docker.sock REDIS_HOST=127.0.0.1 NATS_URL=nats://127.0.0.1:4222 \
//	  ./.tmp/capacity_soak -profile websocket -clients 80 -want 2 -min 1
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	capsoak "eve-industry-planner/testing/capacity_soak/lib"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "capacity_soak: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	var (
		profile     = flag.String("profile", "worker", "worker | websocket")
		stack       = flag.String("stack", "eip", "Swarm stack name prefix")
		timeout     = flag.Duration("timeout", 10*time.Minute, "max wait per scale-up or scale-down phase")
		poll        = flag.Duration("poll", 5*time.Second, "observe interval")
		report      = flag.Duration("report-every", 15*time.Second, "progress log interval")
		queue       = flag.String("queue", "priority_1", "worker: Asynq queue to pause/enqueue")
		enqueue     = flag.Int("enqueue", 40, "worker: paused pending tasks to enqueue")
		want        = flag.Int("want", 2, "replicas to reach on scale-up")
		minReplicas = flag.Int("min", 1, "replicas to accept on scale-down")
		wsURL       = flag.String("ws-url", "ws://traefik:80/ws", "websocket: upgrade URL")
		clients     = flag.Int("clients", 80, "websocket: concurrent hold clients")
		wsDur       = flag.Duration("ws-duration", 3*time.Minute, "websocket: max soak hold (cancelled after scale-up)")
		insecure    = flag.Bool("insecure", false, "websocket: skip TLS verify")
		noSeed      = flag.Bool("no-seed", false, "websocket: skip Redis session seed")
	)
	flag.Parse()

	cfg := capsoak.Config{
		Profile:     capsoak.Profile(*profile),
		StackName:   *stack,
		Timeout:     *timeout,
		PollEvery:   *poll,
		ReportEvery: *report,
		Queue:       *queue,
		EnqueueN:    *enqueue,
		MaxWatch:    *want,
		MinReplicas: *minReplicas,
		WSURL:       *wsURL,
		Clients:     *clients,
		WSDuration:  *wsDur,
		InsecureTLS: *insecure,
		NoSeed:      *noSeed,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	return capsoak.Run(ctx, cfg)
}
