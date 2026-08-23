package capsoak

import (
	"context"
	"fmt"
	"os"
	"strings"

	"eve-industry-planner/testing/harness"
)

// Run executes cfg.Profile / cfg.Phase against a live stack.
func Run(ctx context.Context, cfg Config) error {
	cfg = cfg.withDefaults()
	p, err := ParseProfile(string(cfg.Profile))
	if err != nil {
		return err
	}
	cfg.Profile = p
	ph, err := ParsePhase(string(cfg.Phase))
	if err != nil {
		return err
	}
	cfg.Phase = ph

	nc, err := harness.ConnectNATS()
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
	fmt.Printf("capacity_soak: profile=%s phase=%s\n", cfg.Profile, cfg.Phase)

	switch cfg.Profile {
	case ProfileWorker:
		return runWorker(ctx, obs, cfg)
	case ProfileWebsocket:
		return runWebsocket(ctx, obs, cfg)
	case ProfileAPI:
		return runAPI(ctx, obs, cfg)
	default:
		return fmt.Errorf("unknown profile %q", cfg.Profile)
	}
}
