// Package dataplane checks (and ensures) mongo + S3 after the data fragment.
package dataplane

import (
	"context"
	"fmt"

	"eve-industry-planner/admintool/internal/docker"
	"golang.org/x/sync/errgroup"
)

// ErrNotReady is returned when the data plane is not ready.
type ErrNotReady struct {
	Reason string
}

func (e ErrNotReady) Error() string {
	if e.Reason == "" {
		return "data plane not ready; run eip init / eip ensure-s3 / eip ensure-mongo"
	}
	return fmt.Sprintf("data plane not ready (%s); run eip init / eip ensure-s3 / eip ensure-mongo", e.Reason)
}

// Ready runs EnsureS3 and EnsureMongo concurrently (independent paths).
// Blocks app deploy until both finish.
func Ready(ctx context.Context, stackName string) error {
	// Once up front so concurrent Ensure* do not double-print the docs check.
	if err := checkOperatorDocs(); err != nil {
		return ErrNotReady{Reason: err.Error()}
	}
	if stackName == "" {
		stackName = docker.ResolveStackName()
	}
	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() error {
		return ensureS3(gctx, stackName)
	})
	g.Go(func() error {
		return ensureMongo(gctx, stackName)
	})
	if err := g.Wait(); err != nil {
		return ErrNotReady{Reason: err.Error()}
	}
	return nil
}
