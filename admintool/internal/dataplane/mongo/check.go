package mongo

import (
	"context"
	"fmt"
	"time"
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
	err = retry(ctx, 60*time.Second, 2*time.Second, func() error {
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
	if _, err := mongoshApp(ctx, cid, c, "db.getSiblingDB('eve_industry_planner').runCommand({ping:1}).ok"); err != nil {
		return fmt.Errorf("mongo: app user cannot authenticate to %s", appDatabase)
	}
	return nil
}

// CheckPrimary is an alias for Check (PRIMARY + root + app auth).
func CheckPrimary(ctx context.Context, stackName string) error {
	return Check(ctx, stackName)
}
