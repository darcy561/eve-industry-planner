package mongo

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/admintool/internal/dataplane/task"
)

// Check verifies PRIMARY, root auth, and app user auth (no mutations).
func Check(ctx context.Context, stackName string) error {
	c, err := loadCreds()
	if err != nil {
		return err
	}
	cid, err := waitTask(ctx, stackName, 90*time.Second)
	if err != nil {
		return err
	}
	err = task.Retry(ctx, 60*time.Second, 2*time.Second, func() error {
		ok, err := isPrimary(ctx, cid, c)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("not PRIMARY")
		}
		if _, err := mongoshRoot(ctx, cid, c, "db.adminCommand('ping').ok", nil); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("mongo is not PRIMARY or root ping failed: %w", err)
	}
	pingJS := fmt.Sprintf("db.getSiblingDB(%q).runCommand({ping:1}).ok", appDatabase)
	if _, err := mongoshApp(ctx, cid, c, pingJS); err != nil {
		return fmt.Errorf("mongo: app user cannot authenticate to %s", appDatabase)
	}
	return nil
}
