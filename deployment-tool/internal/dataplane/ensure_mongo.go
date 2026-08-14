package dataplane

import (
	"context"

	"eve-industry-planner/deployment-tool/internal/dataplane/mongo"
	"eve-industry-planner/deployment-tool/internal/docker"
)

// EnsureMongo is the SoT entry for mongo desired state (keyfile, RS, users,
// preimages, indexes). Used by Ready and eip ensure-mongo / init.
// No short timeout — cancel via parent ctx / interrupt only.
func EnsureMongo(ctx context.Context, stackName string) error {
	if err := checkOperatorDocs(); err != nil {
		return err
	}
	return ensureMongo(ctx, stackName)
}

func ensureMongo(ctx context.Context, stackName string) error {
	if stackName == "" {
		stackName = docker.ResolveStackName()
	}
	return mongo.Ensure(ctx, stackName)
}
