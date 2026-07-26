// Package mongo manages the Swarm mongo task: keyfile SoT, Ensure (RS/users/preimages),
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

	"eve-industry-planner/admintool/internal/kit"
)

const (
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
	if stackName == "" {
		stackName = kit.StackName
	}
	svc := stackName + "_mongo"
	cmd := exec.CommandContext(ctx, "docker", "ps", "-q",
		"--filter", "label=com.docker.swarm.service.name="+svc,
		"--filter", "status=running",
	)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return "", err
	}
	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) == 0 || strings.TrimSpace(lines[0]) == "" {
		return "", nil
	}
	return strings.TrimSpace(lines[0]), nil
}

// waitTask blocks until a running mongo Swarm task exists, returning its container id.
func waitTask(ctx context.Context, stackName string, timeout time.Duration) (string, error) {
	if timeout <= 0 {
		timeout = 90 * time.Second
	}
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		cid, err := containerID(ctx, stackName)
		if err != nil {
			return "", err
		}
		if cid != "" {
			return cid, nil
		}
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
	return "", fmt.Errorf("mongo task did not become running in time")
}

// TaskRunning reports whether a mongo Swarm task is currently running.
func TaskRunning(ctx context.Context, stackName string) (bool, error) {
	cid, err := containerID(ctx, stackName)
	if err != nil {
		return false, err
	}
	return cid != "", nil
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
	User    string // empty = no auth
	Pass    string
	AuthDB  string
	Eval    string
	Env     []string // KEY=VAL for docker exec -e
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
