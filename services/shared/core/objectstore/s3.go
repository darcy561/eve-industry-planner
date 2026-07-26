package objectstore

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"strings"

	s3sdk "github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// S3Backend is an S3-compatible client using path-style addressing.
type S3Backend struct {
	client *s3sdk.Client
	bucket string
}

func openS3(ctx context.Context, cfg dialConfig) (*S3Backend, error) {
	if cfg.AccessKey == "" || cfg.SecretKey == "" {
		return nil, fmt.Errorf("S3_ACCESS_KEY and S3_SECRET_KEY are required")
	}
	if cfg.Bucket == "" {
		return nil, fmt.Errorf("bucket name is required")
	}

	endpoint, secure, err := parseS3Endpoint(cfg.Endpoint, cfg.UseSSL)
	if err != nil {
		return nil, err
	}

	client, err := s3sdk.New(endpoint, &s3sdk.Options{
		Creds:        credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure:       secure,
		BucketLookup: s3sdk.BucketLookupPath,
	})
	if err != nil {
		return nil, fmt.Errorf("s3 client: %w", err)
	}

	exists, err := client.BucketExists(ctx, cfg.Bucket)
	if err != nil {
		return nil, fmt.Errorf("s3 bucket check: %w", err)
	}
	if !exists {
		if !cfg.EnsureBucket {
			return nil, fmt.Errorf("s3 bucket %q does not exist — run make up / provision-s3", cfg.Bucket)
		}
		if err := client.MakeBucket(ctx, cfg.Bucket, s3sdk.MakeBucketOptions{}); err != nil {
			return nil, fmt.Errorf("s3 create bucket %q: %w", cfg.Bucket, err)
		}
	}

	return &S3Backend{client: client, bucket: cfg.Bucket}, nil
}

func parseS3Endpoint(raw string, useSSL bool) (host string, secure bool, err error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", false, fmt.Errorf("empty S3 endpoint")
	}
	if !strings.Contains(raw, "://") {
		return strings.TrimSuffix(raw, "/"), useSSL, nil
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", false, err
	}
	host = u.Host
	if host == "" {
		host = u.Path
	}
	secure = u.Scheme == "https"
	if useSSL {
		secure = true
	}
	return host, secure, nil
}

func (b *S3Backend) Kind() string { return "s3" }

func (b *S3Backend) Get(ctx context.Context, key string) ([]byte, error) {
	key = NormalizeKey(key)
	obj, err := b.client.GetObject(ctx, b.bucket, key, s3sdk.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	defer obj.Close()
	data, err := io.ReadAll(obj)
	if err != nil {
		if errorsIsNotFound(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return data, nil
}

func (b *S3Backend) Put(ctx context.Context, key string, data []byte) error {
	key = NormalizeKey(key)
	_, err := b.client.PutObject(ctx, b.bucket, key, bytes.NewReader(data), int64(len(data)), s3sdk.PutObjectOptions{
		ContentType: "application/json",
	})
	return err
}

func (b *S3Backend) Delete(ctx context.Context, key string) error {
	key = NormalizeKey(key)
	return b.client.RemoveObject(ctx, b.bucket, key, s3sdk.RemoveObjectOptions{})
}

func (b *S3Backend) Exists(ctx context.Context, key string) (bool, error) {
	_, err := b.Stat(ctx, key)
	if err == nil {
		return true, nil
	}
	if errorsIsNotFound(err) {
		return false, nil
	}
	return false, err
}

func (b *S3Backend) Stat(ctx context.Context, key string) (ObjectInfo, error) {
	key = NormalizeKey(key)
	info, err := b.client.StatObject(ctx, b.bucket, key, s3sdk.StatObjectOptions{})
	if err != nil {
		if errorsIsNotFound(err) {
			return ObjectInfo{}, ErrNotFound
		}
		return ObjectInfo{}, err
	}
	return ObjectInfo{Key: key, Size: info.Size, ModTime: info.LastModified.UTC()}, nil
}

func (b *S3Backend) ListKeys(ctx context.Context, prefix string) ([]string, error) {
	prefix = NormalizeKey(prefix)
	opts := s3sdk.ListObjectsOptions{Prefix: prefix, Recursive: true}
	var keys []string
	for obj := range b.client.ListObjects(ctx, b.bucket, opts) {
		if obj.Err != nil {
			return nil, obj.Err
		}
		if obj.Key == "" || strings.HasSuffix(obj.Key, "/") {
			continue
		}
		keys = append(keys, obj.Key)
	}
	return keys, nil
}

func (b *S3Backend) ListChildNames(ctx context.Context, prefix string) ([]string, error) {
	prefix = NormalizeKey(prefix)
	if prefix != "" && !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}
	opts := s3sdk.ListObjectsOptions{Prefix: prefix, Recursive: false}
	seen := map[string]struct{}{}
	var names []string
	for obj := range b.client.ListObjects(ctx, b.bucket, opts) {
		if obj.Err != nil {
			return nil, obj.Err
		}
		rel := strings.TrimPrefix(obj.Key, prefix)
		if rel == "" {
			continue
		}
		name := rel
		if i := strings.IndexByte(rel, '/'); i >= 0 {
			name = rel[:i]
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		names = append(names, name)
	}
	return names, nil
}

func (b *S3Backend) CopyPrefix(ctx context.Context, srcPrefix, dstPrefix string) error {
	srcPrefix = NormalizeKey(srcPrefix)
	dstPrefix = NormalizeKey(dstPrefix)
	keys, err := b.ListKeys(ctx, srcPrefix)
	if err != nil {
		return err
	}
	srcBase := strings.TrimSuffix(srcPrefix, "/")
	dstBase := strings.TrimSuffix(dstPrefix, "/")
	for _, key := range keys {
		suffix := strings.TrimPrefix(key, srcBase)
		suffix = strings.TrimPrefix(suffix, "/")
		dstKey := dstBase
		if suffix != "" {
			dstKey = dstBase + "/" + suffix
		}
		src := s3sdk.CopySrcOptions{Bucket: b.bucket, Object: key}
		dst := s3sdk.CopyDestOptions{Bucket: b.bucket, Object: dstKey}
		if _, err := b.client.CopyObject(ctx, dst, src); err != nil {
			return fmt.Errorf("copy %s → %s: %w", key, dstKey, err)
		}
	}
	return nil
}

func (b *S3Backend) DeletePrefix(ctx context.Context, prefix string) error {
	keys, err := b.ListKeys(ctx, prefix)
	if err != nil {
		return err
	}
	for _, key := range keys {
		if err := b.Delete(ctx, key); err != nil {
			return err
		}
	}
	return nil
}

func errorsIsNotFound(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, ErrNotFound) {
		return true
	}
	resp := s3sdk.ToErrorResponse(err)
	return resp.Code == "NoSuchKey" || resp.Code == "NotFound" || resp.StatusCode == 404 ||
		strings.Contains(err.Error(), "The specified key does not exist")
}
