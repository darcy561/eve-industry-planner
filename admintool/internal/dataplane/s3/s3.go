// Package s3 talks to the Swarm seaweedfs task via weed shell (no aws-cli).
package s3

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"regexp"
	"strings"
	"time"

	"eve-industry-planner/admintool/internal/kit"
)

// App buckets (keep in sync with objectstore + docker-stack.data.yml).
const (
	BucketStatic     = "static-data"
	BucketStaticTest = "static-data-test"
)

func appBuckets() []string {
	return []string{BucketStatic, BucketStaticTest}
}

func containerID(ctx context.Context, stackName string) (string, error) {
	if stackName == "" {
		stackName = kit.StackName
	}
	svc := stackName + "_seaweedfs"
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

// WaitLive waits until seaweedfs is up and s3.bucket.list works.
func WaitLive(ctx context.Context, stackName string, timeout time.Duration) (string, error) {
	if timeout <= 0 {
		timeout = 90 * time.Second
	}
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if err := ctx.Err(); err != nil {
			return "", err
		}
		cid, err := containerID(ctx, stackName)
		if err != nil {
			return "", err
		}
		if cid != "" {
			if _, err := weedShell(ctx, cid, "s3.bucket.list"); err == nil {
				return cid, nil
			}
		}
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
	return "", fmt.Errorf("SeaweedFS did not become live in time")
}

// BucketExists reports whether name appears in s3.bucket.list.
func BucketExists(ctx context.Context, cid, name string) (bool, error) {
	out, err := weedShell(ctx, cid, "s3.bucket.list")
	if err != nil {
		return false, err
	}
	re := regexp.MustCompile(`(?m)^[[:space:]]*` + regexp.QuoteMeta(name) + `([[:space:]]|$)`)
	return re.MatchString(out), nil
}

// EnsureBucket creates the bucket if missing (eip init).
func EnsureBucket(ctx context.Context, cid, name string) error {
	ok, err := BucketExists(ctx, cid, name)
	if err != nil {
		return err
	}
	if ok {
		return nil
	}
	if _, err := weedShell(ctx, cid, "s3.bucket.create -name "+name); err != nil {
		return err
	}
	ok, err = BucketExists(ctx, cid, name)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("failed to create bucket %s", name)
	}
	return nil
}

// EnsureAppBuckets waits for live S3 and ensures static-data buckets (eip init).
func EnsureAppBuckets(ctx context.Context, stackName string) error {
	cid, err := WaitLive(ctx, stackName, 90*time.Second)
	if err != nil {
		return err
	}
	for _, b := range appBuckets() {
		if err := EnsureBucket(ctx, cid, b); err != nil {
			return err
		}
	}
	return nil
}

// CheckAppBuckets waits for live S3 and verifies buckets exist (no create).
func CheckAppBuckets(ctx context.Context, stackName string) error {
	cid, err := WaitLive(ctx, stackName, 90*time.Second)
	if err != nil {
		return err
	}
	for _, b := range appBuckets() {
		ok, err := BucketExists(ctx, cid, b)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("bucket %s missing", b)
		}
	}
	return nil
}
