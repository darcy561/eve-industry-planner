package dataplane

import (
	"context"

	"eve-industry-planner/deployment-tool/internal/dataplane/s3"
	"eve-industry-planner/deployment-tool/internal/docker"
	"eve-industry-planner/deployment-tool/internal/kit"
	"eve-industry-planner/deployment-tool/internal/kit/templates"
	"eve-industry-planner/deployment-tool/internal/msg"
)

// EnsureS3 is the SoT entry for app S3 buckets (static-data*).
// Used by Ready and eip ensure-s3 / init. Independent of EnsureMongo.
func EnsureS3(ctx context.Context, stackName string) error {
	if err := checkOperatorDocs(); err != nil {
		return err
	}
	return ensureS3(ctx, stackName)
}

func ensureS3(ctx context.Context, stackName string) error {
	if stackName == "" {
		stackName = docker.ResolveStackName()
	}
	return s3.Ensure(ctx, stackName)
}

func checkOperatorDocs() error {
	home, err := kit.Home()
	if err != nil {
		return err
	}
	msg.Step("Checking .env and eip.config.yaml…")
	if err := templates.CheckOperatorDocs(home); err != nil {
		return err
	}
	msg.Line("operator docs ok")
	return nil
}
