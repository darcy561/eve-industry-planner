// Package objectstore is the shared S3-compatible object-store Backend.
package objectstore

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"eve-industry-planner/shared/core/config"
)

const (
	BucketStaticData     = "static-data"
	BucketStaticDataTest = "static-data-test"
)

var ErrNotFound = errors.New("objectstore: object not found")

type ObjectInfo struct {
	Key     string
	Size    int64
	ModTime time.Time
}

// Backend is a key/value object store with prefix list/copy/delete.
type Backend interface {
	Kind() string
	Get(ctx context.Context, key string) ([]byte, error)
	Put(ctx context.Context, key string, data []byte) error
	Delete(ctx context.Context, key string) error
	Exists(ctx context.Context, key string) (bool, error)
	Stat(ctx context.Context, key string) (ObjectInfo, error)
	ListKeys(ctx context.Context, prefix string) ([]string, error)
	ListChildNames(ctx context.Context, prefix string) ([]string, error)
	CopyPrefix(ctx context.Context, srcPrefix, dstPrefix string) error
	DeletePrefix(ctx context.Context, prefix string) error
}

type dialConfig struct {
	Endpoint     string
	AccessKey    string
	SecretKey    string
	Bucket       string
	UseSSL       bool
	KeyPrefix    string
	EnsureBucket bool
}

// SeedBuckets is the initial bucket list for object-store first boot.
func SeedBuckets() string {
	return BucketStaticData + "," + BucketStaticDataTest
}

// OpenStaticData opens the static-data bucket.
func OpenStaticData(ctx context.Context) (Backend, error) {
	return openBucket(ctx, BucketStaticData, false)
}

// OpenStaticDataTest opens the static-data-test bucket.
func OpenStaticDataTest(ctx context.Context) (Backend, error) {
	return openBucket(ctx, BucketStaticDataTest, true)
}

func openBucket(ctx context.Context, bucket string, ensureBucket bool) (Backend, error) {
	c, err := config.ObjectStoreConfig()
	if err != nil {
		return nil, err
	}
	return open(ctx, dialConfig{
		Endpoint:     c.Endpoint,
		AccessKey:    c.AccessKey,
		SecretKey:    c.SecretKey,
		Bucket:       bucket,
		UseSSL:       c.UseSSL,
		KeyPrefix:    c.KeyPrefix,
		EnsureBucket: ensureBucket,
	})
}

func open(ctx context.Context, cfg dialConfig) (Backend, error) {
	if strings.TrimSpace(cfg.Endpoint) == "" {
		return nil, fmt.Errorf("S3 endpoint is required")
	}
	if strings.TrimSpace(cfg.Bucket) == "" {
		return nil, fmt.Errorf("bucket name is required")
	}
	b, err := openS3(ctx, cfg)
	if err != nil {
		return nil, err
	}
	if cfg.KeyPrefix != "" {
		return WithKeyPrefix(b, cfg.KeyPrefix), nil
	}
	return b, nil
}

func NormalizeKey(key string) string {
	key = strings.ReplaceAll(key, "\\", "/")
	return strings.TrimPrefix(key, "/")
}
