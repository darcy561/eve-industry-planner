package mongo

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/deployment-tool/internal/dataplane/task"
	"eve-industry-planner/deployment-tool/internal/msg"
)

// ensureStep is one idempotent stage of Ensure, named for its log line.
type ensureStep struct {
	name string
	run  func(ctx context.Context, cid string, c creds) error
}

// ensureSteps run in order.
//
// Renames must precede preimages and indexes: both of those create a collection
// when the name is absent, so running either first leaves the rename facing a
// name that now exists at both ends, which it refuses. Order is asserted by
// TestEnsureStepsRenameBeforeCreators.
var ensureSteps = []ensureStep{
	{name: "replica set", run: ensureReplicaSet},
	{name: "users", run: ensureUsers},
	{name: "collection names", run: ensureRenames},
	{name: "preimage collections", run: ensurePreimages},
	{name: "retired indexes", run: dropRetiredIndexes},
	{name: "indexes", run: ensureIndexes},
}

// Ensure brings a running mongo task to desired state (idempotent):
// keyfile SoT, then each ensureStep in order, then Check.
// Callers should use dataplane.EnsureMongo (Ready / eip ensure-mongo / init).
// Index builds are not short-timeout'd — progress via msg; cancel via parent ctx.
func Ensure(ctx context.Context, stackName string) error {
	if err := EnsureKeyfile(); err != nil {
		return err
	}
	c, err := loadCreds()
	if err != nil {
		return err
	}

	msg.Step("Ensuring mongo…")
	cid, err := waitTask(ctx, stackName, 90*time.Second)
	if err != nil {
		return err
	}

	if err := waitPing(ctx, cid, c, 120*time.Second); err != nil {
		return err
	}
	for _, step := range ensureSteps {
		if err := step.run(ctx, cid, c); err != nil {
			return err
		}
		msg.Line(step.name + " ok")
	}
	if err := Check(ctx, stackName); err != nil {
		return err
	}
	msg.Step("Mongo ensure complete")
	return nil
}

func waitPing(ctx context.Context, cid string, c creds, timeout time.Duration) error {
	err := task.Retry(ctx, timeout, time.Second, func() error {
		if _, err := mongoshUnauth(ctx, cid, "db.adminCommand('ping').ok"); err == nil {
			return nil
		}
		if _, err := mongoshRoot(ctx, cid, c, "db.adminCommand('ping').ok", nil); err == nil {
			return nil
		}
		return fmt.Errorf("ping failed")
	})
	if err != nil {
		return fmt.Errorf("mongo: failed to become ready: %w", err)
	}
	return nil
}
