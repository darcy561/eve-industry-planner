package mongo

import (
	"context"
	"fmt"
	"strings"
)

// createFirstRootJS uses the localhost exception (auth enabled, zero users).
// Only createUser is allowed there — getUser/updateUser require auth.
const createFirstRootJS = `
const rootUser = process.env.EIP_MONGO_ROOT_USERNAME;
const rootPwd = process.env.EIP_MONGO_ROOT_PASSWORD;
if (!rootUser || !rootPwd) {
  throw new Error('Missing EIP_MONGO_ROOT_USERNAME / EIP_MONGO_ROOT_PASSWORD');
}
const adminDb = db.getSiblingDB('admin');
adminDb.createUser({
  user: rootUser,
  pwd: rootPwd,
  roles: [{ role: 'root', db: 'admin' }]
});
true;
`

// ensureUsersJS matches scripts/bootstrap/mongo-setup.sh ensure_users (process.env).
// Runs with root auth after the first user exists.
const ensureUsersJS = `
const rootUser = process.env.EIP_MONGO_ROOT_USERNAME;
const rootPwd = process.env.EIP_MONGO_ROOT_PASSWORD;
const appUser = process.env.EIP_MONGO_USERNAME;
const appPwd = process.env.EIP_MONGO_PASSWORD;

if (!rootUser || !rootPwd || !appUser || !appPwd) {
  throw new Error('Missing required Mongo env vars for user bootstrap');
}

const adminDb = db.getSiblingDB('admin');
const appDb = db.getSiblingDB('eve_industry_planner');

try {
  const rootExisting = adminDb.getUser(rootUser);
  if (rootExisting == null) {
    adminDb.createUser({
      user: rootUser,
      pwd: rootPwd,
      roles: [{ role: 'root', db: 'admin' }]
    });
  } else {
    adminDb.updateUser(rootUser, { pwd: rootPwd });
  }
} catch (e) {
  throw new Error('ENSURE_ROOT_FAILED: ' + e);
}

try {
  const appExisting = appDb.getUser(appUser);
  if (appExisting == null) {
    appDb.createUser({
      user: appUser,
      pwd: appPwd,
      roles: [{ role: 'readWrite', db: 'eve_industry_planner' }]
    });
  } else {
    appDb.updateUser(appUser, { pwd: appPwd });
  }
} catch (e) {
  throw new Error('ENSURE_APP_FAILED: ' + e);
}

if (adminDb.getUser(rootUser) == null) {
  throw new Error('MISSING_ROOT_USER_AFTER_ENSURE');
}
if (appDb.getUser(appUser) == null) {
  throw new Error('MISSING_APP_USER_AFTER_ENSURE');
}

try {
  adminDb.adminCommand({ fsync: 1 });
} catch (e) {
  throw new Error('FSYNC_FAILED: ' + e);
}

true;
`

func credEnv(c creds) []string {
	return []string{
		"EIP_MONGO_ROOT_USERNAME=" + c.RootUser,
		"EIP_MONGO_ROOT_PASSWORD=" + c.RootPass,
		"EIP_MONGO_USERNAME=" + c.AppUser,
		"EIP_MONGO_PASSWORD=" + c.AppPass,
	}
}

func ensureUsers(ctx context.Context, cid string, c creds) error {
	env := credEnv(c)

	// Root already works → skip localhost create.
	if _, err := mongoshRoot(ctx, cid, c, "db.adminCommand('ping').ok", nil); err != nil {
		out, err := mongosh(ctx, cid, mongoshOpts{Eval: createFirstRootJS, Env: env})
		if err != nil && !strings.Contains(out, "already exists") && !strings.Contains(err.Error(), "already exists") {
			// If create failed for another reason, surface it (unless root can auth now).
			if _, pingErr := mongoshRoot(ctx, cid, c, "db.adminCommand('ping').ok", nil); pingErr != nil {
				if out != "" {
					return fmt.Errorf("mongo: create first root: %w\n%s", err, out)
				}
				return fmt.Errorf("mongo: create first root: %w", err)
			}
		}
	}

	out, err := mongoshRoot(ctx, cid, c, ensureUsersJS, env)
	if err != nil {
		if out != "" {
			return fmt.Errorf("mongo: ensure users: %w\n%s", err, out)
		}
		return fmt.Errorf("mongo: ensure users: %w", err)
	}
	return nil
}
