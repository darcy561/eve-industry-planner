package objectstore

import (
	"bytes"
	"context"
	"maps"
	"slices"
	"strings"
	"sync"
	"time"
)

// MemoryBackend is an in-process Backend, for tests and for any caller that
// wants object storage without a store to dial.
//
// It matches S3Backend's semantics rather than a map's, because a test passing
// against a friendlier fake says nothing about the real thing: a missing key is
// ErrNotFound, keys are normalised on the way in, and a prefix listing is
// recursive while a child listing collapses everything below one level into the
// name of that level.
type MemoryBackend struct {
	mu      sync.RWMutex
	objects map[string]memoryObject
	// now is the clock ModTime is read from, so a test can make one object
	// older than another without sleeping.
	now func() time.Time
}

type memoryObject struct {
	data    []byte
	modTime time.Time
}

// NewMemoryBackend returns an empty in-process store.
func NewMemoryBackend() *MemoryBackend {
	return &MemoryBackend{objects: map[string]memoryObject{}, now: time.Now}
}

// SetClock replaces the clock ModTime is stamped from.
func (b *MemoryBackend) SetClock(now func() time.Time) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.now = now
}

// Len reports how many objects are held, so a test can assert that a delete
// reached the store rather than only that a read stopped finding something.
func (b *MemoryBackend) Len() int {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.objects)
}

func (b *MemoryBackend) Kind() string { return "memory" }

func (b *MemoryBackend) Get(ctx context.Context, key string) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	b.mu.RLock()
	defer b.mu.RUnlock()

	object, held := b.objects[NormalizeKey(key)]
	if !held {
		return nil, ErrNotFound
	}
	// Copied out, so a caller mutating what it read cannot reach into the store.
	return bytes.Clone(object.data), nil
}

func (b *MemoryBackend) Put(ctx context.Context, key string, data []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	b.mu.Lock()
	defer b.mu.Unlock()

	b.objects[NormalizeKey(key)] = memoryObject{
		data:    bytes.Clone(data),
		modTime: b.now().UTC(),
	}
	return nil
}

// Delete removes a key. Deleting one that is not held is not an error, which is
// what S3 does.
func (b *MemoryBackend) Delete(ctx context.Context, key string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	b.mu.Lock()
	defer b.mu.Unlock()

	delete(b.objects, NormalizeKey(key))
	return nil
}

func (b *MemoryBackend) Exists(ctx context.Context, key string) (bool, error) {
	_, err := b.Stat(ctx, key)
	if err == nil {
		return true, nil
	}
	if err == ErrNotFound {
		return false, nil
	}
	return false, err
}

func (b *MemoryBackend) Stat(ctx context.Context, key string) (ObjectInfo, error) {
	if err := ctx.Err(); err != nil {
		return ObjectInfo{}, err
	}
	b.mu.RLock()
	defer b.mu.RUnlock()

	key = NormalizeKey(key)
	object, held := b.objects[key]
	if !held {
		return ObjectInfo{}, ErrNotFound
	}
	return ObjectInfo{Key: key, Size: int64(len(object.data)), ModTime: object.modTime}, nil
}

// ListKeys reports every key under prefix, sorted. S3 lists in lexical order
// and callers are entitled to rely on it.
func (b *MemoryBackend) ListKeys(ctx context.Context, prefix string) ([]string, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	b.mu.RLock()
	defer b.mu.RUnlock()

	prefix = NormalizeKey(prefix)
	var keys []string
	for key := range b.objects {
		if strings.HasPrefix(key, prefix) {
			keys = append(keys, key)
		}
	}
	slices.Sort(keys)
	return keys, nil
}

// ListChildNames reports the distinct next path segment below prefix, so a
// directory of pages answers with the page names and not their whole keys.
func (b *MemoryBackend) ListChildNames(ctx context.Context, prefix string) ([]string, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	b.mu.RLock()
	defer b.mu.RUnlock()

	prefix = NormalizeKey(prefix)
	if prefix != "" && !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}

	seen := map[string]struct{}{}
	for key := range b.objects {
		if !strings.HasPrefix(key, prefix) {
			continue
		}
		rel := strings.TrimPrefix(key, prefix)
		if rel == "" {
			continue
		}
		name := rel
		if before, _, cut := strings.Cut(rel, "/"); cut {
			name = before
		}
		seen[name] = struct{}{}
	}

	names := slices.Collect(maps.Keys(seen))
	slices.Sort(names)
	return names, nil
}

func (b *MemoryBackend) CopyPrefix(ctx context.Context, srcPrefix, dstPrefix string) error {
	keys, err := b.ListKeys(ctx, srcPrefix)
	if err != nil {
		return err
	}

	srcBase := strings.TrimSuffix(NormalizeKey(srcPrefix), "/")
	dstBase := strings.TrimSuffix(NormalizeKey(dstPrefix), "/")

	b.mu.Lock()
	defer b.mu.Unlock()
	for _, key := range keys {
		suffix := strings.TrimPrefix(strings.TrimPrefix(key, srcBase), "/")
		dstKey := dstBase
		if suffix != "" {
			dstKey = dstBase + "/" + suffix
		}
		object := b.objects[key]
		b.objects[dstKey] = memoryObject{
			data:    bytes.Clone(object.data),
			modTime: b.now().UTC(),
		}
	}
	return nil
}

func (b *MemoryBackend) DeletePrefix(ctx context.Context, prefix string) error {
	keys, err := b.ListKeys(ctx, prefix)
	if err != nil {
		return err
	}

	b.mu.Lock()
	defer b.mu.Unlock()
	for _, key := range keys {
		delete(b.objects, key)
	}
	return nil
}
