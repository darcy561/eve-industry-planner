package capsoak

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	natslib "github.com/nats-io/nats.go"
)

// Run executes cfg.Profile against a live stack.
func Run(ctx context.Context, cfg Config) error {
	cfg = cfg.withDefaults()
	p, err := ParseProfile(string(cfg.Profile))
	if err != nil {
		return err
	}
	cfg.Profile = p

	nc, err := connectNATS()
	if err != nil {
		return err
	}
	defer nc.Close()

	obs, err := NewObserver(cfg.StackName, nc)
	if err != nil {
		return err
	}
	defer obs.Close()
	if obs.Docker == nil {
		fmt.Println("capacity_soak: DOCKER_HOST unset — using NATS health running counts (desired unknown)")
	} else {
		fmt.Printf("capacity_soak: docker observe via %s\n", strings.TrimSpace(os.Getenv("DOCKER_HOST")))
	}

	switch cfg.Profile {
	case ProfileWorker:
		return runWorker(ctx, obs, cfg)
	case ProfileWebsocket:
		return runWebsocket(ctx, obs, cfg)
	default:
		return fmt.Errorf("unknown profile %q", cfg.Profile)
	}
}

func connectNATS() (*natslib.Conn, error) {
	url := strings.TrimSpace(os.Getenv("NATS_URL"))
	if url == "" {
		url = "nats://nats:4222"
	}
	nc, err := natslib.Connect(url, natslib.Name("capacity_soak"), natslib.Timeout(5*time.Second))
	if err != nil {
		return nil, fmt.Errorf("nats: %w", err)
	}
	return nc, nil
}
