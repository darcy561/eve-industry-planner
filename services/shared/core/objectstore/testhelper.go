package objectstore

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

// OpenTestStore opens the test bucket with a unique key prefix.
// Skips if S3_URL / credentials are missing or the store is unreachable.
func OpenTestStore(t *testing.T) Backend {
	t.Helper()
	loadRepoDotEnv(t)

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	t.Cleanup(cancel)

	endpoint := strings.TrimSpace(os.Getenv("S3_URL"))
	if endpoint == "" {
		t.Skip("S3_URL not set")
	}
	access := strings.TrimSpace(os.Getenv("S3_ACCESS_KEY"))
	secret := strings.TrimSpace(os.Getenv("S3_SECRET_KEY"))
	if access == "" || secret == "" || secret == "auto-generate-me" {
		t.Skip("S3_ACCESS_KEY / S3_SECRET_KEY not set")
	}

	prefix := fmt.Sprintf("testrun-%s/", uuid.NewString())
	b, err := open(ctx, dialConfig{
		Endpoint:     endpoint,
		AccessKey:    access,
		SecretKey:    secret,
		Bucket:       BucketStaticDataTest,
		KeyPrefix:    prefix,
		EnsureBucket: true,
		UseSSL:       strings.HasPrefix(strings.ToLower(endpoint), "https://"),
	})
	if err != nil {
		t.Skipf("object store unavailable at %s: %v", endpoint, err)
	}

	t.Cleanup(func() {
		cctx, ccancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer ccancel()
		if pb, ok := b.(*PrefixBackend); ok {
			_ = pb.inner.DeletePrefix(cctx, pb.RootPrefix())
			return
		}
		_ = b.DeletePrefix(cctx, "")
	})

	t.Setenv("S3_URL", endpoint)
	t.Setenv("S3_ACCESS_KEY", access)
	t.Setenv("S3_SECRET_KEY", secret)
	t.Setenv("SDE_STORE_KEY_PREFIX", prefix)

	return b
}

func loadRepoDotEnv(t *testing.T) {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		return
	}
	var envPath string
	for {
		candidate := filepath.Join(dir, ".env")
		if _, err := os.Stat(candidate); err == nil {
			envPath = candidate
			break
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return
		}
		dir = parent
	}
	f, err := os.Open(envPath)
	if err != nil {
		return
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, val, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		val = strings.TrimSpace(val)
		val = strings.Trim(val, `"'`)
		if os.Getenv(key) != "" {
			continue
		}
		switch key {
		case "S3_ACCESS_KEY", "S3_SECRET_KEY", "S3_URL":
			_ = os.Setenv(key, val)
		}
	}
}
