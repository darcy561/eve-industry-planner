// Command capacity-controller owns cluster-shape decisions (Observe → Evaluate → Apply).
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"eve-industry-planner/capacity-controller/ctl"
)

const (
	leaseKey          = "lease:capacity:primary"
	defaultTick       = 15 * time.Second
	shutdownTimeout   = 10 * time.Second
	policyPathEnv     = "EIP_CAPACITY_POLICY_PATH"
	defaultPolicyPath = "/etc/eip/eip.config.yaml"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	args := os.Args[1:]
	var err error
	if len(args) > 0 && args[0] == "ctl" {
		err = runCtl(ctx, args[1:])
	} else {
		err = runServe(ctx)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "capacity-controller:", err)
		os.Exit(1)
	}
}

func runCtl(ctx context.Context, args []string) error {
	rt, cleanup, err := openRuntime(ctx, false)
	if err != nil {
		return err
	}
	defer cleanup()
	return ctl.Run(ctx, ctl.Deps{
		Cluster: rt.swarm,
		Cfg:     rt.cfgHolder.get,
	}, args)
}
