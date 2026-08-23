// Command capacity_soak drills capacity-controller scale-up/down on a live Swarm stack.
//
// Implementation: eve-industry-planner/testing/capacity_soak/lib (package capsoak).
// Shared: eve-industry-planner/testing/harness (NATS, Asynq Redis), .../wait (poll loops).
// WS clients: eve-industry-planner/testing/ws_soak/lib (ProfileHold, Accounts=Clients).
//
// Phases (any profile): -phase all|up|down
//
// Worker:
//
//	go build -o ../.tmp/capacity_soak ./capacity_soak
//	DOCKER_HOST=unix:///var/run/docker.sock \
//	  ./.tmp/capacity_soak -profile worker -phase all -enqueue 40 -want 2 -min 1
//
// Websocket (eip-core; soaklib hold with Accounts==Clients):
//
//	# Sync low target_clients + short scale_*; managed websocket.
//	docker run --rm --network eip-core --env-file ../.env \
//	  -e LOG_LEVEL=warn -e REDIS_HOST=redis -e REDIS_PORT=6379 -e NATS_URL=nats://nats:4222 \
//	  -e REDIS_PASSWORD -e DOCKER_HOST=unix:///var/run/docker.sock \
//	  -v /var/run/docker.sock:/var/run/docker.sock \
//	  -v "$PWD/../.tmp/capacity_soak:/capacity_soak:ro" --entrypoint /capacity_soak alpine:3.20 \
//	  -profile websocket -phase all -clients 80 -want 2 -min 1
//
// Api (same hold; asserts api replicas):
//
//	… -profile api -phase all -clients 80 -want 2 -min 1
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
		profile     = flag.String("profile", "worker", "worker | websocket | api")
		phase       = flag.String("phase", "all", "all | up | down")
		stack       = flag.String("stack", "eip", "Swarm stack name prefix")
		timeout     = flag.Duration("timeout", 10*time.Minute, "max wait per phase (up, down, live-clients, idle)")
		poll        = flag.Duration("poll", 5*time.Second, "observe interval")
		report      = flag.Duration("report-every", 15*time.Second, "progress log interval")
		queue       = flag.String("queue", "priority_1", "worker: Asynq queue to pause/enqueue")
		enqueue     = flag.Int("enqueue", 40, "worker: paused pending tasks to enqueue")
		want        = flag.Int("want", 2, "replicas to reach on scale-up")
		minReplicas = flag.Int("min", 1, "replicas to accept on scale-down")
		wsURL       = flag.String("ws-url", "ws://traefik:80/ws", "websocket/api: upgrade URL")
		clients     = flag.Int("clients", 80, "websocket/api: concurrent hold clients")
		wsDur       = flag.Duration("ws-duration", 5*time.Minute, "websocket/api: max soak hold (cancelled after scale-up)")
		ramp        = flag.Duration("ramp", 0, "websocket/api: connect stagger (0 = auto from -clients)")
		minLive     = flag.Int("min-live", 0, "websocket/api: live clients before scale-up wait (0 = ~80% of -clients)")
		insecure    = flag.Bool("insecure", false, "websocket/api: skip TLS verify")
		noSeed      = flag.Bool("no-seed", false, "websocket/api: skip Redis session seed")
		seedOnly    = flag.Bool("seed-only", false, "websocket/api: seed Redis sessions and exit")
	)
	flag.Parse()

	prof, err := capsoak.ParseProfile(*profile)
	if err != nil {
		return err
	}
	ph, err := capsoak.ParsePhase(*phase)
	if err != nil {
		return err
	}

	cfg := capsoak.Config{
		Profile:     prof,
		Phase:       ph,
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
		Ramp:        *ramp,
		MinLive:     *minLive,
		Insecure:    *insecure,
		NoSeed:      *noSeed,
		SeedOnly:    *seedOnly,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	return capsoak.Run(ctx, cfg)
}
