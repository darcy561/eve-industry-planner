// Package dataplane ensures data-plane services after the data fragment
// (ServiceEnsures registry: mongo, seaweedfs, …).
package dataplane

import (
	"context"
	"fmt"

	"eve-industry-planner/admintool/internal/docker"
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

// Ready runs every ServiceEnsures registry entry concurrently.
// Blocks app deploy until all finish.
func Ready(ctx context.Context, stackName string) error {
	// Once up front so concurrent ensures do not double-print the docs check.
	if err := checkOperatorDocs(); err != nil {
		return ErrNotReady{Reason: err.Error()}
	}
	if stackName == "" {
		stackName = docker.ResolveStackName()
	}
	if err := RunAllEnsures(ctx, stackName); err != nil {
		return ErrNotReady{Reason: err.Error()}
	}
	return nil
}
