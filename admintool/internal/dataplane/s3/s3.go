// Package s3 talks to the Swarm seaweedfs task via weed shell (no aws-cli).
// Callers should use dataplane.EnsureS3 (Ready / eip ensure-s3 / init).
package s3

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"eve-industry-planner/admintool/internal/dataplane/task"
	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/internal/msg"
)

const serviceName = "seaweedfs"

// App buckets (keep in sync with objectstore + docker-stack.data.yml S3_BUCKET).
const (
	BucketStatic     = "static-data"
	BucketStaticTest = "static-data-test"
)

var safeBucketName = regexp.MustCompile(`^[a-zA-Z0-9._-]+$`)

// AppBuckets is the declarative list Ensure creates / Check verifies.
func AppBuckets() []string {
	return []string{BucketStatic, BucketStaticTest}
}

func requireSafeBucket(name string) error {
	if !safeBucketName.MatchString(name) {
		return fmt.Errorf("s3: invalid bucket name %q", name)
	}
	return nil
}

// TaskRunning reports whether a seaweedfs Swarm task is currently running.
func TaskRunning(ctx context.Context, stackName string) (bool, error) {
	return task.Running(ctx, stackName, serviceName)
}

func weedShell(ctx context.Context, cid string, script string) (string, error) {
	cmd := exec.CommandContext(ctx, "docker", "exec", "-i", cid, "weed", "shell")
	cmd.Stdin = strings.NewReader(script + "\n")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return stdout.String(), fmt.Errorf("weed shell: %w: %s", err, stderr.String())
	}
	return stdout.String(), nil
}

func waitLive(ctx context.Context, stackName string, timeout time.Duration) (string, error) {
	return task.Wait(ctx, stackName, serviceName, timeout, func(ctx context.Context, cid string) error {
		_, err := weedShell(ctx, cid, "s3.bucket.list")
		return err
	})
}

// BucketExists reports whether name appears in s3.bucket.list.
func BucketExists(ctx context.Context, cid, name string) (bool, error) {
	if err := requireSafeBucket(name); err != nil {
		return false, err
	}
	out, err := weedShell(ctx, cid, "s3.bucket.list")
	if err != nil {
		return false, err
	}
	re := regexp.MustCompile(`(?m)^[[:space:]]*` + regexp.QuoteMeta(name) + `([[:space:]]|$)`)
	return re.MatchString(out), nil
}

func ensureBucket(ctx context.Context, cid, name string) error {
	if err := requireSafeBucket(name); err != nil {
		return err
	}
	ok, err := BucketExists(ctx, cid, name)
	if err != nil {
		return err
	}
	if ok {
		msg.Line(fmt.Sprintf("  s3: bucket %s ok", name))
		return nil
	}
	msg.Line(fmt.Sprintf("  s3: creating bucket %s…", name))
	if _, err := weedShell(ctx, cid, "s3.bucket.create -name "+name); err != nil {
		return err
	}
	ok, err = BucketExists(ctx, cid, name)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("s3: failed to create bucket %s", name)
	}
	msg.Line(fmt.Sprintf("  s3: bucket %s ok", name))
	return nil
}

func loadCreds() error {
	home, err := kit.Home()
	if err != nil {
		return err
	}
	m, err := kit.Map(filepath.Join(home, kit.EnvFile))
	if err != nil {
		return err
	}
	access := kit.Get(m, "S3_ACCESS_KEY")
	secret := kit.Get(m, "S3_SECRET_KEY")
	if access == "" {
		access = kit.Get(m, "MINIO_ROOT_USER")
	}
	if secret == "" {
		secret = kit.Get(m, "MINIO_ROOT_PASSWORD")
	}
	if access == "" || secret == "" {
		return fmt.Errorf("s3: S3_ACCESS_KEY and S3_SECRET_KEY required in %s", kit.EnvFile)
	}
	return nil
}

// Ensure waits for SeaweedFS and creates app buckets (idempotent).
func Ensure(ctx context.Context, stackName string) error {
	if err := loadCreds(); err != nil {
		return err
	}
	msg.Step("Ensuring S3…")
	cid, err := waitLive(ctx, stackName, 90*time.Second)
	if err != nil {
		return err
	}
	for _, b := range AppBuckets() {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := ensureBucket(ctx, cid, b); err != nil {
			return err
		}
	}
	msg.Line("s3: buckets ok")
	if err := Check(ctx, stackName); err != nil {
		return err
	}
	msg.Step("S3 ensure complete")
	return nil
}

// Check waits for SeaweedFS and verifies app buckets exist (no create).
func Check(ctx context.Context, stackName string) error {
	if err := loadCreds(); err != nil {
		return err
	}
	cid, err := waitLive(ctx, stackName, 90*time.Second)
	if err != nil {
		return err
	}
	for _, b := range AppBuckets() {
		ok, err := BucketExists(ctx, cid, b)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("s3: bucket %s missing", b)
		}
	}
	return nil
}
