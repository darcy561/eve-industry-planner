package objectstore

import (
	"context"
	"strings"
)

// PrefixBackend namespaces all keys under a prefix for test isolation.
type PrefixBackend struct {
	inner  Backend
	prefix string
}

func WithKeyPrefix(inner Backend, prefix string) Backend {
	prefix = NormalizeKey(prefix)
	if prefix == "" {
		return inner
	}
	if !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}
	return &PrefixBackend{inner: inner, prefix: prefix}
}

func (p *PrefixBackend) Kind() string { return p.inner.Kind() }

func (p *PrefixBackend) mapKey(key string) string {
	key = NormalizeKey(key)
	if key == "" {
		return p.prefix
	}
	return p.prefix + key
}

func (p *PrefixBackend) stripKey(key string) string {
	return strings.TrimPrefix(NormalizeKey(key), p.prefix)
}

func (p *PrefixBackend) Get(ctx context.Context, key string) ([]byte, error) {
	return p.inner.Get(ctx, p.mapKey(key))
}

func (p *PrefixBackend) Put(ctx context.Context, key string, data []byte) error {
	return p.inner.Put(ctx, p.mapKey(key), data)
}

func (p *PrefixBackend) Delete(ctx context.Context, key string) error {
	return p.inner.Delete(ctx, p.mapKey(key))
}

func (p *PrefixBackend) Exists(ctx context.Context, key string) (bool, error) {
	return p.inner.Exists(ctx, p.mapKey(key))
}

func (p *PrefixBackend) Stat(ctx context.Context, key string) (ObjectInfo, error) {
	info, err := p.inner.Stat(ctx, p.mapKey(key))
	if err != nil {
		return ObjectInfo{}, err
	}
	info.Key = p.stripKey(info.Key)
	return info, nil
}

func (p *PrefixBackend) ListKeys(ctx context.Context, prefix string) ([]string, error) {
	keys, err := p.inner.ListKeys(ctx, p.mapKey(prefix))
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(keys))
	for _, k := range keys {
		out = append(out, p.stripKey(k))
	}
	return out, nil
}

func (p *PrefixBackend) ListChildNames(ctx context.Context, prefix string) ([]string, error) {
	return p.inner.ListChildNames(ctx, p.mapKey(prefix))
}

func (p *PrefixBackend) CopyPrefix(ctx context.Context, srcPrefix, dstPrefix string) error {
	return p.inner.CopyPrefix(ctx, p.mapKey(srcPrefix), p.mapKey(dstPrefix))
}

func (p *PrefixBackend) DeletePrefix(ctx context.Context, prefix string) error {
	return p.inner.DeletePrefix(ctx, p.mapKey(prefix))
}

// RootPrefix returns the absolute object prefix.
func (p *PrefixBackend) RootPrefix() string { return p.prefix }
