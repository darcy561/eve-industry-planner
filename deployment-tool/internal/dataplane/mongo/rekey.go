package mongo

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	"eve-industry-planner/deployment-tool/internal/dataplane/task"
	"eve-industry-planner/deployment-tool/internal/msg"
)

const (
	rekeyContainerName = "eip-mongo-rekey"
	rekeyMongoImage    = "mongo:8"
	rekeyTmpSuffix     = ".rekey-tmp"
)

// authFirstMongodCmd matches docker-stack.data.yml: copy bind keyFile to /tmp (mode 600), then mongod.
const authFirstMongodCmd = "cp /etc/mongo-keyfile /tmp/mongo-keyfile && chmod 600 /tmp/mongo-keyfile && exec mongod --replSet rs0 --bind_ip_all --auth --keyFile /tmp/mongo-keyfile"

// Test hooks for Rekey.
var (
	taskRunningFn       = TaskRunning
	startRekeyMongodFn  = startRekeyMongod
	stopRekeyMongodFn   = stopRekeyMongod
	waitRekeyRootAuthFn = waitRekeyRootAuth
)

// Rekey proves MONGO_ROOT_* against the data volume while the Swarm mongo task is down,
// then installs a newly generated ./mongo-keyfile + .bak.
//
// MongoDB requires --keyFile with --replSet --auth, so a candidate keyfile starts the
// temp mongod; it is promoted to the host SoT only after root auth succeeds.
// Does not scale Swarm, deploy stacks, or run Ensure.
func Rekey(ctx context.Context, stackName string) error {
	running, err := taskRunningFn(ctx, stackName)
	if err != nil {
		return err
	}
	if running {
		return fmt.Errorf("mongo: swarm mongo task is still running — stop the stack first; rekey assumes mongo is down")
	}

	c, err := loadCreds()
	if err != nil {
		return err
	}

	hasData, vol, err := volumeHasDataFn()
	if err != nil {
		return err
	}
	if !hasData || vol == "" {
		return fmt.Errorf("mongo: no provisioned data volume %s", mongoDataVolume)
	}

	path, bak, err := resolveKeyfilePaths()
	if err != nil {
		return err
	}

	tmp := path + rekeyTmpSuffix
	_ = os.Remove(tmp)
	if err := writeKeyfileContents(tmp); err != nil {
		return err
	}
	defer func() { _ = os.Remove(tmp) }()

	msg.Step("Rekeying mongo (temp mongod with candidate keyFile)…")
	msg.Line("volume " + vol)

	cid, err := startRekeyMongodFn(ctx, vol, tmp)
	if err != nil {
		return err
	}
	defer func() { _ = stopRekeyMongodFn(context.Background(), cid) }()

	if err := waitRekeyRootAuthFn(ctx, cid, c, 90*time.Second); err != nil {
		return err
	}
	msg.Line("root credentials ok")

	if err := installKeyfileSoT(tmp, path, bak, "rekeyed"); err != nil {
		return fmt.Errorf("mongo: install %s: %w", keyFileName, err)
	}

	msg.Step("Mongo rekey complete — bring the stack up, then eip ensure-mongo if needed")
	return nil
}

func startRekeyMongod(ctx context.Context, volume, keyfileHostPath string) (string, error) {
	_ = exec.CommandContext(ctx, "docker", "rm", "-f", rekeyContainerName).Run()

	cmd := exec.CommandContext(ctx, "docker", "run", "-d",
		"--name", rekeyContainerName,
		"--hostname", "mongo",
		"--add-host", "mongo:127.0.0.1",
		"-v", volume+":/data/db",
		"-v", keyfileHostPath+":/etc/mongo-keyfile:ro",
		rekeyMongoImage,
		"bash", "-c", authFirstMongodCmd,
	)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("mongo: start rekey mongod on %s: %w\n%s", volume, err, stderr.String())
	}
	cid := strings.TrimSpace(stdout.String())
	if cid == "" {
		return "", fmt.Errorf("mongo: start rekey mongod: empty container id")
	}
	return cid, nil
}

func stopRekeyMongod(ctx context.Context, cid string) error {
	name := rekeyContainerName
	if cid != "" {
		name = cid
	}
	cmd := exec.CommandContext(ctx, "docker", "rm", "-f", name)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("mongo: stop rekey mongod: %w\n%s", err, stderr.String())
	}
	return nil
}

func waitRekeyRootAuth(ctx context.Context, cid string, c creds, timeout time.Duration) error {
	err := task.Retry(ctx, timeout, time.Second, func() error {
		if _, err := mongoshRoot(ctx, cid, c, "db.adminCommand('ping').ok", nil); err != nil {
			return err
		}
		out, err := mongoshRoot(ctx, cid, c, "rs.isMaster().ismaster", nil)
		if err != nil {
			return err
		}
		if out != "true" {
			return fmt.Errorf("not PRIMARY yet")
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("mongo: root auth against rekey mongod failed (check MONGO_ROOT_*): %w", err)
	}
	return nil
}
