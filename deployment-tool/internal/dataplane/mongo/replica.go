package mongo

import (
	"context"
	"fmt"
	"strings"
	"time"

	"eve-industry-planner/deployment-tool/internal/dataplane/task"
)

const jsInitiate = `
rs.initiate({
  _id: 'rs0',
  members: [{ _id: 0, host: 'mongo:27017' }]
})
`

func ensureReplicaSet(ctx context.Context, cid string, c creds) error {
	if rsStatusOK(ctx, cid, c) {
		return waitPrimary(ctx, cid, c, 60*time.Second)
	}
	if _, err := mongoshTryUnauthThenRoot(ctx, cid, c, jsInitiate); err != nil {
		// Concurrent initiate / already done — re-check status.
		if !rsStatusOK(ctx, cid, c) {
			return fmt.Errorf("mongo: rs.initiate: %w", err)
		}
	}
	return waitPrimary(ctx, cid, c, 60*time.Second)
}

func rsStatusOK(ctx context.Context, cid string, c creds) bool {
	out, err := mongoshTryUnauthThenRoot(ctx, cid, c, "rs.status().ok")
	if err != nil {
		return false
	}
	return out == "1" || strings.EqualFold(out, "true")
}

func waitPrimary(ctx context.Context, cid string, c creds, timeout time.Duration) error {
	err := task.Retry(ctx, timeout, time.Second, func() error {
		ok, err := isPrimary(ctx, cid, c)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("not PRIMARY yet")
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("mongo: replica set initialized but PRIMARY not ready: %w", err)
	}
	return nil
}

func isPrimary(ctx context.Context, cid string, c creds) (bool, error) {
	out, err := mongoshTryUnauthThenRoot(ctx, cid, c, "rs.isMaster().ismaster")
	if err != nil {
		return false, err
	}
	return out == "true", nil
}
