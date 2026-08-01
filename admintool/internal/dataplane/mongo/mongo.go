// Package mongo manages the Swarm mongo task: keyfile SoT, Ensure (RS/users/preimages/indexes),
// Check, and recovery helpers (restore-mongo-keyfile, rekey-mongo).
package mongo

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"eve-industry-planner/admintool/internal/dataplane/task"
	"eve-industry-planner/admintool/internal/kit"
)

const (
	serviceName = "mongo"
	keyFileName = "mongo-keyfile"
	appDatabase = "eve_industry_planner"
	envCollMod  = "EIP_COLLMOD_COLL_NAME"
)

type creds struct {
	RootUser string
	RootPass string
	AppUser  string
	AppPass  string
}

func containerID(ctx context.Context, stackName string) (string, error) {
	return task.ContainerID(ctx, stackName, serviceName)
}

func waitTask(ctx context.Context, stackName string, timeout time.Duration) (string, error) {
	return task.Wait(ctx, stackName, serviceName, timeout, nil)
}

// TaskRunning reports whether a mongo Swarm task is currently running.
func TaskRunning(ctx context.Context, stackName string) (bool, error) {
	return task.Running(ctx, stackName, serviceName)
}

func loadCreds() (creds, error) {
	home, err := kit.Home()
	if err != nil {
		return creds{}, err
	}
	m, err := kit.Map(filepath.Join(home, kit.EnvFile))
	if err != nil {
		return creds{}, err
	}
	c := creds{
		RootUser: kit.Get(m, "MONGO_ROOT_USERNAME"),
		RootPass: kit.Get(m, "MONGO_ROOT_PASSWORD"),
		AppUser:  kit.Get(m, "MONGO_USERNAME"),
		AppPass:  kit.Get(m, "MONGO_PASSWORD"),
	}
	if c.RootUser == "" || c.RootPass == "" || c.AppUser == "" || c.AppPass == "" {
		return creds{}, fmt.Errorf("mongo: MONGO_ROOT_USERNAME, MONGO_ROOT_PASSWORD, MONGO_USERNAME, MONGO_PASSWORD required in %s", kit.EnvFile)
	}
	return c, nil
}

// mongoshOpts configures a mongosh --eval inside the mongo container.
type mongoshOpts struct {
	User   string // empty = no auth
	Pass   string
	AuthDB string
	Eval   string
	Env    []string // KEY=VAL for docker exec -e
}

func mongosh(ctx context.Context, cid string, o mongoshOpts) (string, error) {
	args := []string{"exec"}
	for _, e := range o.Env {
		args = append(args, "-e", e)
	}
	args = append(args, cid, "mongosh", "--quiet")
	if o.User != "" {
		authDB := o.AuthDB
		if authDB == "" {
			authDB = "admin"
		}
		args = append(args, "-u", o.User, "-p", o.Pass, "--authenticationDatabase", authDB)
	}
	args = append(args, "--eval", o.Eval)

	cmd := exec.CommandContext(ctx, "docker", args...)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	return strings.TrimSpace(out.String()), err
}

func mongoshUnauth(ctx context.Context, cid, eval string) (string, error) {
	return mongosh(ctx, cid, mongoshOpts{Eval: eval})
}

func mongoshRoot(ctx context.Context, cid string, c creds, eval string, env []string) (string, error) {
	return mongosh(ctx, cid, mongoshOpts{
		User: c.RootUser, Pass: c.RootPass, AuthDB: "admin",
		Eval: eval, Env: env,
	})
}

func mongoshApp(ctx context.Context, cid string, c creds, eval string) (string, error) {
	return mongosh(ctx, cid, mongoshOpts{
		User: c.AppUser, Pass: c.AppPass, AuthDB: appDatabase,
		Eval: eval,
	})
}

// mongoshTryUnauthThenRoot runs eval without auth, then with root if needed.
func mongoshTryUnauthThenRoot(ctx context.Context, cid string, c creds, eval string) (string, error) {
	out, err := mongoshUnauth(ctx, cid, eval)
	if err == nil {
		return out, nil
	}
	return mongoshRoot(ctx, cid, c, eval, nil)
}
