// Package dataplane checks (and ensures) mongo + S3 after the data fragment.
package dataplane

import (
	"context"
	"fmt"

	"eve-industry-planner/admintool/internal/dataplane/mongo"
	"eve-industry-planner/admintool/internal/dataplane/s3"
	"eve-industry-planner/admintool/internal/docker"
)

// ErrNotReady is returned when the data plane is not ready.
type ErrNotReady struct {
	Reason string
}

func (e ErrNotReady) Error() string {
	if e.Reason == "" {
		return "data plane not ready; run eip init / eip ensure-mongo"
	}
	return fmt.Sprintf("data plane not ready (%s); run eip init / eip ensure-mongo", e.Reason)
}

// Ready verifies S3 buckets exist and ensures mongo desired state (RS, users, preimages).
func Ready(ctx context.Context, stackName string) error {
	if stackName == "" {
		stackName = docker.ResolveStackName()
	}
	if err := s3.CheckAppBuckets(ctx, stackName); err != nil {
		return ErrNotReady{Reason: err.Error()}
	}
	if err := mongo.Ensure(ctx, stackName); err != nil {
		return ErrNotReady{Reason: err.Error()}
	}
	return nil
}
