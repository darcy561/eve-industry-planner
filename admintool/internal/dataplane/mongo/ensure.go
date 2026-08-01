package mongo

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/admintool/internal/dataplane/task"
	"eve-industry-planner/admintool/internal/msg"
)

// Ensure brings a running mongo task to desired state (idempotent):
// keyfile SoT, replica set, root + app users, preimage collections, indexes, then Check.
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
	if err := ensureReplicaSet(ctx, cid, c); err != nil {
		return err
	}
	msg.Line("replica set ok")
	if err := ensureUsers(ctx, cid, c); err != nil {
		return err
	}
	msg.Line("users ok")
	if err := ensurePreimages(ctx, cid, c); err != nil {
		return err
	}
	msg.Line("preimage collections ok")
	if err := ensureIndexes(ctx, cid, c); err != nil {
		return err
	}
	msg.Line("indexes ok")
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
