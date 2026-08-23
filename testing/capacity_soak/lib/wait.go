package capsoak

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/testing/wait"
)

func waitReplicas(ctx context.Context, every, reportEvery time.Duration, label string, get func(context.Context) (Shape, error), ok func(Shape) bool, alive func() error) (Shape, error) {
	var last Shape
	err := wait.Until(ctx, wait.Options{
		Every:       every,
		ReportEvery: reportEvery,
		Alive:       alive,
		Report: func(msg string) {
			fmt.Printf("capacity_soak: waiting %s\n", msg)
		},
	}, func(ctx context.Context) (bool, string, error) {
		sh, err := get(ctx)
		if err != nil {
			return false, "", err
		}
		last = sh
		msg := fmt.Sprintf("%s desired=%d running=%d source=%s", label, sh.Desired, sh.Running, sh.Source)
		return ok(sh), msg, nil
	})
	return last, err
}

func waitWebsocketClients(ctx context.Context, obs *Observer, every, reportEvery time.Duration, label string, need int, atLeast bool, alive func() error) (ClientCensus, error) {
	var last ClientCensus
	err := wait.Until(ctx, wait.Options{
		Every:       every,
		ReportEvery: reportEvery,
		Alive:       alive,
		Report: func(msg string) {
			fmt.Printf("capacity_soak: waiting %s\n", msg)
		},
	}, func(ctx context.Context) (bool, string, error) {
		c, err := obs.WebsocketClients(ctx)
		if err != nil {
			return false, "", err
		}
		last = c
		pass := c.Clients >= need
		if !atLeast {
			pass = c.Clients <= need
		}
		msg := fmt.Sprintf("%s clients=%d backends=%d need=%d", label, c.Clients, c.Backends, need)
		return pass, msg, nil
	})
	return last, err
}
